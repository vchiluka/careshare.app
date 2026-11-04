/**
 * npm run db:seed            load the synthetic seed into an empty database (tenant "demo")
 * npm run db:seed -- --reset  replace whatever is there with the seed (documents only; audit is kept)
 *
 * Refused when CARESHARE_ENV=production: production is never seeded. Staging runs this in CI after
 * migrations; Neon preview branches inherit staging's data when they are created.
 */

import { Pool } from "pg";
import { loadSeed } from "../src/lib/store/memory";
import { pendingMigrations } from "../src/lib/db/migrate";
import { DEMO_TENANT_ID } from "../src/lib/tenant";
import { GENESIS, auditHash } from "../src/lib/db/audit-hash";

async function main() {
  if (process.env.CARESHARE_ENV === "production") {
    console.error("Refusing to seed production.");
    process.exit(3);
  }
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) {
    console.error("Set DATABASE_URL_UNPOOLED or DATABASE_URL.");
    process.exit(2);
  }
  const reset = process.argv.includes("--reset");
  const pool = new Pool({ connectionString: url, max: 1, ssl: /sslmode=require|neon\.tech/.test(url) ? { rejectUnauthorized: true } : undefined });
  const c = await pool.connect();
  try {
    const pending = await pendingMigrations(c);
    if (pending.length) throw new Error(`apply migrations first: ${pending.map((m) => m.version).join(", ")}`);
    const seed = loadSeed();
    await c.query("begin");
    await c.query("select set_config('app.tenant_id', $1, true)", ["*"]);
    await c.query("insert into tenants (id, name) values ($1, $2) on conflict (id) do nothing", [DEMO_TENANT_ID, "Demo clinic (synthetic)"]);
    const existing = await c.query<{ n: number }>("select count(*)::int as n from documents where tenant_id = $1", [DEMO_TENANT_ID]);
    if (existing.rows[0].n > 0 && !reset) {
      console.log(`tenant ${DEMO_TENANT_ID} already has ${existing.rows[0].n} documents; pass --reset to replace them`);
      await c.query("rollback");
      return;
    }
    if (reset) await c.query("delete from documents where tenant_id = $1", [DEMO_TENANT_ID]);
    const put = (kind: string, id: string, data: unknown) =>
      c.query(
        `insert into documents (tenant_id, kind, id, data, updated_by) values ($1, $2, $3, $4::jsonb, 'seed')
         on conflict (kind, id) do update set data = excluded.data, version = documents.version + 1, updated_at = now(), updated_by = 'seed'`,
        [DEMO_TENANT_ID, kind, id, JSON.stringify(data)],
      );
    for (const h of seed.households) await put("household", h.id, h);
    for (const s of seed.staff) await put("staff", s.id, s);
    for (const a of seed.accounts) await put("account", a.id, a);
    await c.query("insert into meta (key, value) values ('seed_generated_on', $1) on conflict (key) do update set value = excluded.value", [seed.generatedOn]);
    await c.query("select pg_advisory_xact_lock(hashtext($1))", [`audit:${DEMO_TENANT_ID}`]);
    const last = await c.query<{ hash: string }>("select hash from audit.events where tenant_id = $1 order by id desc limit 1", [DEMO_TENANT_ID]);
    const prevHash = last.rows[0]?.hash ?? GENESIS;
    const at = new Date().toISOString();
    const reference = `${seed.households.length} households, ${seed.staff.length} staff, ${seed.accounts.length} accounts`;
    const hash = auditHash(prevHash, { at, tenantId: DEMO_TENANT_ID, actor: "system", action: reset ? "store.reseeded" : "store.seeded", reference });
    await c.query(
      `insert into audit.events (at, tenant_id, actor, action, reference, prev_hash, hash) values ($1, $2, 'system', $3, $4, $5, $6)`,
      [at, DEMO_TENANT_ID, reset ? "store.reseeded" : "store.seeded", reference, prevHash, hash],
    );
    await c.query("commit");
    console.log(`seeded tenant ${DEMO_TENANT_ID}: ${seed.households.length} households, ${seed.staff.length} staff, ${seed.accounts.length} accounts (generated ${seed.generatedOn})`);
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    c.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
