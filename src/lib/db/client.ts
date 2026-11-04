/**
 * Postgres connection for the app (Neon in every deployed environment, a local server in tests).
 *
 *   DATABASE_URL            pooled connection string; the app's only database setting at runtime
 *   DATABASE_URL_UNPOOLED   direct connection string; used by migrations only (scripts/migrate.ts)
 *
 * One pool per process. Every query that touches tenant data runs inside withTenant(), which opens a
 * transaction and sets app.tenant_id for it; the row-level security policies in db/migrations read
 * that setting. A query outside withTenant() sees no documents at all, by design.
 */

import { Pool, type PoolClient } from "pg";

const g = globalThis as unknown as { __careshareDbPool?: Pool };

export function connectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. The postgres store needs a Neon connection string.");
  return url;
}

export function pool(): Pool {
  if (!g.__careshareDbPool) {
    g.__careshareDbPool = new Pool({
      connectionString: connectionString(),
      max: Number(process.env.DATABASE_POOL_MAX ?? 5),
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
      // Neon requires TLS; a local test server does not offer it. The URL decides.
      ssl: /sslmode=require|neon\.tech/.test(connectionString()) ? { rejectUnauthorized: true } : undefined,
    });
  }
  return g.__careshareDbPool;
}

/** The tenant a query runs as. "*" is reserved for migrations, seeding and the chain verifier. */
export type TenantScope = string;

export async function withTenant<T>(tenantId: TenantScope, fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool().connect();
  try {
    await c.query("begin");
    await c.query("select set_config('app.tenant_id', $1, true)", [tenantId]);
    const out = await fn(c);
    await c.query("commit");
    return out;
  } catch (e) {
    try {
      await c.query("rollback");
    } catch {
      // the connection is already broken; releasing it below discards it
    }
    throw e;
  } finally {
    c.release();
  }
}

/** Close the pool. Tests call this; the app never does. */
export async function closePool(): Promise<void> {
  if (g.__careshareDbPool) {
    await g.__careshareDbPool.end();
    g.__careshareDbPool = undefined;
  }
}
