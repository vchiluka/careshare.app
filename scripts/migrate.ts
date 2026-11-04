/**
 * npm run db:migrate            apply pending migrations
 * npm run db:migrate -- --status  list applied and pending
 * npm run db:migrate -- --down 0001  revert one migration (refused when CARESHARE_ENV=production)
 *
 * Connects with DATABASE_URL_UNPOOLED if set (migrations want a direct connection), else DATABASE_URL.
 * CI runs this against staging on every merge to main and against production on release, before the
 * app can report healthy. Secrets come from the environment, never from arguments.
 */

import { Pool } from "pg";
import { appliedVersions, listMigrations, migrateDown, migrateUp, pendingMigrations } from "../src/lib/db/migrate";

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) {
    console.error("Set DATABASE_URL_UNPOOLED (preferred) or DATABASE_URL.");
    process.exit(2);
  }
  const pool = new Pool({ connectionString: url, max: 1, ssl: /sslmode=require|neon\.tech/.test(url) ? { rejectUnauthorized: true } : undefined });
  const args = process.argv.slice(2);
  try {
    if (args.includes("--status")) {
      const applied = await appliedVersions(pool);
      const pending = await pendingMigrations(pool);
      console.log(`applied: ${applied.join(", ") || "none"}`);
      console.log(`pending: ${pending.map((m) => `${m.version}_${m.name}`).join(", ") || "none"}`);
      console.log(`known:   ${listMigrations().map((m) => m.version).join(", ")}`);
      return;
    }
    const downAt = args.indexOf("--down");
    if (downAt !== -1) {
      if (process.env.CARESHARE_ENV === "production") {
        console.error("Refusing to revert a migration in production. Write a forward migration instead.");
        process.exit(3);
      }
      const version = args[downAt + 1];
      if (!version) throw new Error("--down needs a version, e.g. --down 0001");
      await migrateDown(pool, version, undefined, console.log);
      console.log(`reverted ${version}`);
      return;
    }
    const done = await migrateUp(pool, undefined, console.log);
    console.log(done.length ? `applied ${done.join(", ")}` : "nothing to apply");
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
