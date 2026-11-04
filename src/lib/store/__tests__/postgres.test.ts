/**
 * Runs against a real Postgres named by TEST_DATABASE_URL (a local server, or a throwaway Neon branch
 * in CI). Skipped when the variable is absent so `npm test` stays runnable offline; `npm run test:db`
 * and CI always set it. The database is dropped to a clean schema at the start of the file.
 *
 * The role in TEST_DATABASE_URL must own the database and must NOT be a superuser: superusers bypass
 * row-level security, so the isolation tests would pass vacuously. Neon's default role qualifies; for
 * a local server see docs/RUNBOOK.md ("Local Postgres for tests").
 */
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { verifyChain } from "@/lib/db/audit-hash";
import { closePool, pool, withTenant } from "@/lib/db/client";
import { appliedVersions, listMigrations, migrateDown, migrateUp } from "@/lib/db/migrate";
import { createPostgresRepository } from "../postgres";
import { repositoryContract } from "./contract";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

async function cleanSchema(u: string) {
  const admin = new Pool({ connectionString: u, max: 1 });
  await admin.query("drop schema if exists audit cascade");
  await admin.query("drop schema public cascade; create schema public");
  await admin.end();
}

d("postgres store", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    delete process.env.STORE_DRIVER;
    await cleanSchema(url!);
    await migrateUp(pool());
  });
  afterAll(async () => {
    await closePool();
  });

  it("applies every migration once and reports the version", async () => {
    const applied = await appliedVersions(pool());
    expect(applied).toEqual(listMigrations().map((m) => m.version));
    expect(await migrateUp(pool())).toEqual([]); // idempotent
  });

  repositoryContract("postgres", async () => createPostgresRepository());

  it("hides every row from a request that did not set its tenant, and from another tenant", async () => {
    const repo = createPostgresRepository();
    await repo.reset();
    const c = await pool().connect();
    try {
      const none = await c.query("select count(*)::int as n from documents");
      expect(none.rows[0].n).toBe(0); // no app.tenant_id in this session
    } finally {
      c.release();
    }
    const other = await withTenant("someone-else", async (c) => (await c.query("select count(*)::int as n from documents")).rows[0].n);
    expect(other).toBe(0);
    const mine = await withTenant("demo", async (c) => (await c.query("select count(*)::int as n from documents")).rows[0].n);
    expect(mine).toBeGreaterThan(0);
    await expect(withTenant("someone-else", (c) => c.query("insert into documents (tenant_id, kind, id, data) values ('demo','staff','x','{}')"))).rejects.toThrow(/row-level security/);
  });

  it("serializes concurrent household updates instead of losing one", async () => {
    const repo = createPostgresRepository();
    await repo.reset();
    const [h] = await repo.households();
    await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        repo.updateHousehold(h.id, (d) => {
          d.contacts.push({ id: `ct_conc_${i}`, date: "2026-10-01", kind: "phone", byStaffId: "st_test", minutes: 5, summary: "concurrency test", supports: ["care_management"] });
        }),
      ),
    );
    const after = await repo.household(h.id);
    expect(after!.contacts.filter((c) => c.id.startsWith("ct_conc_")).length).toBe(5);
    const v = await withTenant("demo", async (c) => (await c.query("select version from documents where kind='household' and id=$1", [h.id])).rows[0].version);
    expect(v).toBeGreaterThanOrEqual(6);
  });

  it("chains audit hashes and refuses updates and deletes", async () => {
    const repo = createPostgresRepository();
    await repo.reset();
    for (let i = 0; i < 4; i++) await repo.audit({ actor: "staff:t", action: `chain.${i}`, householdId: i % 2 ? "hh_1" : undefined });
    const rows = await withTenant("demo", async (c) =>
      (await c.query("select id::text, at, tenant_id, actor, action, household_id, reference, detail, prev_hash, hash from audit.events e where tenant_id='demo' order by e.id")).rows.map((r) => ({
        id: r.id,
        at: new Date(r.at).toISOString(),
        tenantId: r.tenant_id,
        actor: r.actor,
        action: r.action,
        householdId: r.household_id,
        reference: r.reference,
        detail: r.detail,
        prevHash: r.prev_hash,
        hash: r.hash,
      })),
    );
    expect(rows.length).toBeGreaterThanOrEqual(5); // store.reset + 4
    expect(verifyChain(rows)).toMatchObject({ ok: true });
    // Tamper in memory: the verifier must notice.
    const tampered = rows.map((r, i) => (i === 2 ? { ...r, action: "chain.forged" } : r));
    expect(verifyChain(tampered).ok).toBe(false);
    // Tamper in the database: the rules swallow it.
    const upd = await withTenant("demo", (c) => c.query("update audit.events set action = 'forged' where tenant_id='demo'"));
    expect(upd.rowCount).toBe(0);
    const del = await withTenant("demo", (c) => c.query("delete from audit.events where tenant_id='demo'"));
    expect(del.rowCount).toBe(0);
    const still = await withTenant("demo", async (c) => (await c.query("select count(*)::int as n from audit.events where tenant_id='demo'")).rows[0].n);
    expect(still).toBe(rows.length);
  });

  it("refuses reset in production", async () => {
    process.env.CARESHARE_ENV = "production";
    try {
      await expect(createPostgresRepository().reset()).rejects.toThrow(/production/);
    } finally {
      delete process.env.CARESHARE_ENV;
    }
  });

  it("can revert and re-apply the latest migration", async () => {
    const latest = listMigrations().at(-1)!.version;
    await closePool();
    const p = new Pool({ connectionString: url, max: 1 });
    await migrateDown(p, latest);
    expect((await appliedVersions(p)).includes(latest)).toBe(false);
    await migrateUp(p);
    expect((await appliedVersions(p)).includes(latest)).toBe(true);
    await p.end();
  });
});
