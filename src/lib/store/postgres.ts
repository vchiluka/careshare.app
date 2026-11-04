/**
 * Postgres store (Neon in every deployed environment).
 *
 * Why a document table rather than one table per entity: the household aggregate (patient, caregivers,
 * consents, logs, Medicare import) changes shape with every rule we add. Indexed columns cover what the
 * console filters on; relational tables exist where rows must be immutable (audit) or queried across
 * households (coming with WP4 and WP5). A relational projection for reporting can be added later
 * without changing the Repository interface.
 *
 *   DATABASE_URL     pooled Neon connection string (the only runtime setting)
 *
 * What this driver does not do, on purpose:
 *   * It never creates or alters tables. Migrations in db/migrations are applied by CI
 *     (`npm run db:migrate`) before a deploy; at startup the driver only checks nothing is pending and
 *     fails loudly if it is. A web request must not change the schema.
 *   * It never seeds itself. Staging and preview branches are seeded by `npm run db:seed`; production
 *     is never seeded.
 *   * It never reads a row outside a tenant: every query runs in withTenant(), and the row-level
 *     security policies make a missing tenant setting return nothing.
 *
 * Concurrency: updateHousehold re-reads the row inside the transaction with FOR UPDATE, applies the
 * mutation, and writes it back with version + 1. Two navigators editing the same household serialize
 * instead of overwriting each other, which the old JSON-file stores allowed.
 *
 * Audit: each event's hash covers the previous event's hash for the same tenant, so a removed or
 * altered row breaks the chain. The table also carries DO INSTEAD NOTHING rules for UPDATE and DELETE.
 */

import type { PoolClient } from "pg";
import type { AuditEntry, CaregiverAccount, Household, StaffUser } from "@/lib/domain/types";
import { GENESIS, auditHash } from "@/lib/db/audit-hash";
import { pool, withTenant } from "@/lib/db/client";
import { pendingMigrations, schemaVersion } from "@/lib/db/migrate";
import { currentTenantId } from "@/lib/tenant";
import { loadSeed } from "./memory";
import type { Repository, StoreHealth } from "./repository";

type Kind = "household" | "staff" | "account";

const g = globalThis as unknown as { __careshareSchemaChecked?: Promise<void> };

/** Once per process: refuse to serve if a migration is pending. */
function ensureSchema(): Promise<void> {
  if (!g.__careshareSchemaChecked) {
    g.__careshareSchemaChecked = (async () => {
      const pending = await pendingMigrations(pool());
      if (pending.length) {
        throw new Error(`Database schema is behind: pending migrations ${pending.map((m) => `${m.version}_${m.name}`).join(", ")}. Run npm run db:migrate.`);
      }
    })().catch((e) => {
      g.__careshareSchemaChecked = undefined;
      throw e;
    });
  }
  return g.__careshareSchemaChecked;
}

async function all<T>(c: PoolClient, kind: Kind): Promise<T[]> {
  const r = await c.query<{ data: T }>("select data from documents where kind = $1 order by id", [kind]);
  return r.rows.map((x) => x.data);
}
async function one<T>(c: PoolClient, kind: Kind, id: string): Promise<T | undefined> {
  const r = await c.query<{ data: T }>("select data from documents where kind = $1 and id = $2", [kind, id]);
  return r.rows[0]?.data;
}
async function put(c: PoolClient, tenantId: string, kind: Kind, id: string, data: unknown, by: string): Promise<void> {
  await c.query(
    `insert into documents (tenant_id, kind, id, data, updated_by) values ($1, $2, $3, $4::jsonb, $5)
     on conflict (kind, id) do update set data = excluded.data, version = documents.version + 1, updated_at = now(), updated_by = excluded.updated_by`,
    [tenantId, kind, id, JSON.stringify(data), by],
  );
}

export function createPostgresRepository(): Repository {
  const seed = loadSeed();
  const tenant = () => currentTenantId();
  const scoped = async <T>(fn: (c: PoolClient) => Promise<T>): Promise<T> => {
    await ensureSchema();
    return withTenant(tenant(), fn);
  };

  return {
    driver: "postgres",
    async asOf() {
      return process.env.DEMO_AS_OF ?? seed.asOf ?? new Date().toISOString().slice(0, 10);
    },
    async localities() {
      return seed.localities;
    },
    async sites() {
      return seed.sites;
    },
    async education() {
      return seed.education;
    },
    async resources() {
      return seed.resources;
    },
    staff: () => scoped((c) => all<StaffUser>(c, "staff")),
    staffMember: (id) => scoped((c) => one<StaffUser>(c, "staff", id)),
    upsertStaff: (s) => scoped((c) => put(c, tenant(), "staff", s.id, s, "app")),
    accounts: () => scoped((c) => all<CaregiverAccount>(c, "account")),
    account: (id) => scoped((c) => one<CaregiverAccount>(c, "account", id)),
    upsertAccount: (a) => scoped((c) => put(c, tenant(), "account", a.id, a, "app")),
    households: () => scoped((c) => all<Household>(c, "household")),
    household: (id) => scoped((c) => one<Household>(c, "household", id)),
    updateHousehold: (id, mutate) =>
      scoped(async (c) => {
        const r = await c.query<{ data: Household; version: number }>("select data, version from documents where kind = 'household' and id = $1 for update", [id]);
        const row = r.rows[0];
        if (!row) throw new Error(`Household ${id} not found`);
        const draft = row.data;
        await mutate(draft);
        const u = await c.query(
          `update documents set data = $2::jsonb, version = version + 1, updated_at = now(), updated_by = 'app'
           where kind = 'household' and id = $1 and version = $3`,
          [id, JSON.stringify(draft), row.version],
        );
        if (u.rowCount !== 1) throw new Error(`Household ${id} changed while it was being updated; try again`);
        return draft;
      }),
    addHousehold: (h) => scoped((c) => put(c, tenant(), "household", h.id, h, "app")),
    audit: (entry) =>
      scoped(async (c) => {
        const tenantId = tenant();
        // Serialize appends per tenant so prev_hash is always the true predecessor.
        await c.query("select pg_advisory_xact_lock(hashtext($1))", [`audit:${tenantId}`]);
        const last = await c.query<{ hash: string }>("select hash from audit.events where tenant_id = $1 order by id desc limit 1", [tenantId]);
        const prevHash = last.rows[0]?.hash ?? GENESIS;
        const at = new Date().toISOString();
        const hash = auditHash(prevHash, { at, tenantId, ...entry });
        const ins = await c.query<{ id: string; at: Date }>(
          `insert into audit.events (at, tenant_id, actor, action, household_id, reference, detail, prev_hash, hash)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id, at`,
          [at, tenantId, entry.actor, entry.action, entry.householdId ?? null, entry.reference ?? null, entry.detail ?? null, prevHash, hash],
        );
        return { id: `aud_${ins.rows[0].id}`, at, ...entry };
      }),
    auditLog: (filter) =>
      scoped(async (c) => {
        const limit = filter?.limit ?? 200;
        const r = filter?.householdId
          ? await c.query("select id, at, actor, action, household_id, reference, detail from audit.events where household_id = $1 order by id desc limit $2", [filter.householdId, limit])
          : await c.query("select id, at, actor, action, household_id, reference, detail from audit.events order by id desc limit $1", [limit]);
        return r.rows.map((x: { id: string; at: Date; actor: string; action: string; household_id: string | null; reference: string | null; detail: string | null }) => ({
          id: `aud_${x.id}`,
          at: new Date(x.at).toISOString(),
          actor: x.actor,
          action: x.action,
          householdId: x.household_id ?? undefined,
          reference: x.reference ?? undefined,
          detail: x.detail ?? undefined,
        })) as AuditEntry[];
      }),
    async reset() {
      if (process.env.CARESHARE_ENV === "production") throw new Error("reset is not available in production");
      await scoped(async (c) => {
        await c.query("delete from documents");
        for (const h of seed.households) await put(c, tenant(), "household", h.id, h, "seed");
        for (const s of seed.staff) await put(c, tenant(), "staff", s.id, s, "seed");
        for (const a of seed.accounts) await put(c, tenant(), "account", a.id, a, "seed");
        await c.query("insert into meta (key, value) values ('seed_generated_on', $1) on conflict (key) do update set value = excluded.value", [seed.generatedOn]);
      });
      // The audit trail is never cleared; record that the data was.
      await this.audit({ actor: "system", action: "store.reset", reference: `${seed.households.length} households` });
    },
    async health(): Promise<StoreHealth> {
      const pending = await pendingMigrations(pool());
      const version = await schemaVersion(pool());
      return { driver: "postgres", schemaVersion: version, pendingMigrations: pending.map((m) => m.version), ok: pending.length === 0 };
    },
  };
}
