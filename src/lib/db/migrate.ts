/**
 * Migration runner. Forward-only SQL files in db/migrations, applied in name order inside one
 * transaction each, recorded in schema_migrations. No ORM, no generated SQL: every change to the
 * schema is a file a reviewer can read, and CODEOWNERS requires review on db/.
 *
 * Used by scripts/migrate.ts (CI, before a deploy) and by the postgres store at startup to check that
 * nothing is pending. The store never applies migrations itself: a web request must not change the
 * schema.
 */

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Pool, PoolClient } from "pg";

export interface Migration {
  version: string; // "0001"
  name: string; // "init"
  file: string; // absolute path to the up file
  downFile?: string;
}

export function migrationsDir(): string {
  return process.env.MIGRATIONS_DIR ?? path.join(process.cwd(), "db", "migrations");
}

export function listMigrations(dir = migrationsDir()): Migration[] {
  const files = readdirSync(dir).filter((f) => /^\d{4}_[a-z0-9_]+\.sql$/.test(f)).sort();
  return files.map((f) => {
    const m = /^(\d{4})_([a-z0-9_]+)\.sql$/.exec(f)!;
    const down = path.join(dir, `${m[1]}_${m[2]}.down.sql`);
    let downFile: string | undefined;
    try {
      readFileSync(down);
      downFile = down;
    } catch {
      downFile = undefined;
    }
    return { version: m[1], name: m[2], file: path.join(dir, f), downFile };
  });
}

async function ensureTable(c: PoolClient | Pool) {
  await c.query(`create table if not exists schema_migrations (
    version text primary key, name text not null, applied_at timestamptz not null default now())`);
}

export async function appliedVersions(db: Pool | PoolClient): Promise<string[]> {
  await ensureTable(db);
  const r = await db.query<{ version: string }>("select version from schema_migrations order by version");
  return r.rows.map((x) => x.version);
}

export async function pendingMigrations(db: Pool | PoolClient, dir = migrationsDir()): Promise<Migration[]> {
  const applied = new Set(await appliedVersions(db));
  return listMigrations(dir).filter((m) => !applied.has(m.version));
}

/** Apply every pending migration. Returns the versions applied, in order. */
export async function migrateUp(pool: Pool, dir = migrationsDir(), log: (s: string) => void = () => {}): Promise<string[]> {
  const c = await pool.connect();
  const done: string[] = [];
  try {
    // One migrator at a time: CI for staging and a developer must not interleave.
    await c.query("select pg_advisory_lock(727001)");
    for (const m of await pendingMigrations(c, dir)) {
      log(`applying ${m.version}_${m.name}`);
      await c.query("begin");
      try {
        await c.query(readFileSync(m.file, "utf8"));
        await c.query("insert into schema_migrations (version, name) values ($1, $2)", [m.version, m.name]);
        await c.query("commit");
        done.push(m.version);
      } catch (e) {
        await c.query("rollback");
        throw new Error(`migration ${m.version}_${m.name} failed: ${(e as Error).message}`);
      }
    }
    return done;
  } finally {
    await c.query("select pg_advisory_unlock(727001)").catch(() => {});
    c.release();
  }
}

/** Revert one migration by version. Refuses without a down file. Staging and branches only. */
export async function migrateDown(pool: Pool, version: string, dir = migrationsDir(), log: (s: string) => void = () => {}): Promise<void> {
  const m = listMigrations(dir).find((x) => x.version === version);
  if (!m) throw new Error(`no migration ${version}`);
  if (!m.downFile) throw new Error(`migration ${version}_${m.name} has no down file`);
  const c = await pool.connect();
  try {
    await c.query("select pg_advisory_lock(727001)");
    const applied = await appliedVersions(c);
    if (!applied.includes(version)) throw new Error(`migration ${version} is not applied`);
    const later = applied.filter((v) => v > version);
    if (later.length) throw new Error(`revert ${later.join(", ")} first`);
    log(`reverting ${m.version}_${m.name}`);
    await c.query("begin");
    try {
      await c.query(readFileSync(m.downFile, "utf8"));
      await c.query("delete from schema_migrations where version = $1", [version]);
      await c.query("commit");
    } catch (e) {
      await c.query("rollback");
      throw e;
    }
  } finally {
    await c.query("select pg_advisory_unlock(727001)").catch(() => {});
    c.release();
  }
}

/** The newest applied version, for the health endpoint and the integrations page. */
export async function schemaVersion(db: Pool | PoolClient): Promise<string | undefined> {
  const v = await appliedVersions(db);
  return v.at(-1);
}
