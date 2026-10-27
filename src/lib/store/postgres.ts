/**
 * Postgres store (Neon) — a JSONB document store, seeded on first run.
 *
 * Why documents rather than one table per entity: the household aggregate (patient, caregivers,
 * consents, logs, Medicare import) changes shape with every rule we add, and the pilot needs the
 * data to survive deploys and be shared across serverless instances far more than it needs joins.
 * Indexed columns cover what the console filters on; a relational projection can be added later
 * for reporting without changing the Repository interface.
 *
 *   STORE_DRIVER=postgres (or just DATABASE_URL present)   selects this driver
 *   DATABASE_URL=postgres://…                               Neon pooled connection string
 *
 * Reference data (localities, sites, resources, education) ships with the build in the seed file;
 * only mutable records (households, staff, accounts, audit) live in the database.
 */

import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import type { CaregiverAccount, Household, StaffUser } from "@/lib/domain/types";
import { loadSeed } from "./memory";
import type { Repository } from "./repository";

type Sql = NeonQueryFunction<false, false>;

const g = globalThis as unknown as { __careshareSql?: Sql; __careshareReady?: Promise<void> };

function sql(): Sql {
  if (!g.__careshareSql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("STORE_DRIVER=postgres but DATABASE_URL is not set.");
    g.__careshareSql = neon(url);
  }
  return g.__careshareSql;
}

async function ensureReady(): Promise<void> {
  if (!g.__careshareReady) {
    g.__careshareReady = (async () => {
      const q = sql();
      await q`create table if not exists cs_documents (
        kind text not null, id text not null, data jsonb not null,
        updated_at timestamptz not null default now(), primary key (kind, id))`;
      await q`create index if not exists cs_documents_kind_idx on cs_documents (kind)`;
      await q`create table if not exists cs_audit (
        id bigserial primary key, at timestamptz not null default now(), actor text not null, action text not null,
        household_id text, reference text, detail text)`;
      await q`create index if not exists cs_audit_household_idx on cs_audit (household_id, id desc)`;
      await q`create table if not exists cs_meta (key text primary key, value text not null)`;
      const rows = (await q`select count(*)::int as n from cs_documents where kind = 'household'`) as { n: number }[];
      if ((rows[0]?.n ?? 0) === 0) await seedAll();
    })().catch((e) => {
      g.__careshareReady = undefined;
      throw e;
    });
  }
  return g.__careshareReady;
}

async function seedAll() {
  const q = sql();
  const seed = loadSeed();
  const put = async (kind: string, id: string, data: unknown) => q`insert into cs_documents (kind, id, data) values (${kind}, ${id}, ${JSON.stringify(data)}::jsonb)
    on conflict (kind, id) do update set data = excluded.data, updated_at = now()`;
  for (const h of seed.households) await put("household", h.id, h);
  for (const s of seed.staff) await put("staff", s.id, s);
  for (const a of seed.accounts) await put("account", a.id, a);
  await q`insert into cs_meta (key, value) values ('seed_generated_on', ${seed.generatedOn}) on conflict (key) do update set value = excluded.value`;
  await q`insert into cs_audit (actor, action, reference) values ('system', 'store.seeded', ${`${seed.households.length} households`})`;
}

async function all<T>(kind: string): Promise<T[]> {
  await ensureReady();
  const rows = (await sql()`select data from cs_documents where kind = ${kind} order by id`) as { data: T }[];
  return rows.map((r) => r.data);
}
async function one<T>(kind: string, id: string): Promise<T | undefined> {
  await ensureReady();
  const rows = (await sql()`select data from cs_documents where kind = ${kind} and id = ${id}`) as { data: T }[];
  return rows[0]?.data;
}
async function put(kind: string, id: string, data: unknown): Promise<void> {
  await ensureReady();
  await sql()`insert into cs_documents (kind, id, data) values (${kind}, ${id}, ${JSON.stringify(data)}::jsonb)
    on conflict (kind, id) do update set data = excluded.data, updated_at = now()`;
}

export function createPostgresRepository(): Repository {
  const seed = loadSeed();
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
    staff: () => all<StaffUser>("staff"),
    staffMember: (id) => one<StaffUser>("staff", id),
    upsertStaff: (s) => put("staff", s.id, s),
    accounts: () => all<CaregiverAccount>("account"),
    account: (id) => one<CaregiverAccount>("account", id),
    upsertAccount: (a) => put("account", a.id, a),
    households: () => all<Household>("household"),
    household: (id) => one<Household>("household", id),
    async updateHousehold(id, mutate) {
      const cur = await one<Household>("household", id);
      if (!cur) throw new Error(`Household ${id} not found`);
      await mutate(cur);
      await put("household", id, cur);
      return cur;
    },
    addHousehold: (h) => put("household", h.id, h),
    async audit(entry) {
      await ensureReady();
      const rows = (await sql()`insert into cs_audit (actor, action, household_id, reference, detail)
        values (${entry.actor}, ${entry.action}, ${entry.householdId ?? null}, ${entry.reference ?? null}, ${entry.detail ?? null})
        returning id, at`) as { id: number; at: string }[];
      return { id: `aud_${rows[0].id}`, at: new Date(rows[0].at).toISOString(), ...entry };
    },
    async auditLog(filter) {
      await ensureReady();
      const limit = filter?.limit ?? 200;
      const rows = (filter?.householdId
        ? await sql()`select id, at, actor, action, household_id, reference, detail from cs_audit where household_id = ${filter.householdId} order by id desc limit ${limit}`
        : await sql()`select id, at, actor, action, household_id, reference, detail from cs_audit order by id desc limit ${limit}`) as {
        id: number; at: string; actor: string; action: string; household_id: string | null; reference: string | null; detail: string | null;
      }[];
      return rows.map((r) => ({ id: `aud_${r.id}`, at: new Date(r.at).toISOString(), actor: r.actor, action: r.action, householdId: r.household_id ?? undefined, reference: r.reference ?? undefined, detail: r.detail ?? undefined }));
    },
    async reset() {
      await ensureReady();
      await sql()`delete from cs_documents`;
      await sql()`delete from cs_audit`;
      await seedAll();
    },
  };
}
