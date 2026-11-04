import { createBlobRepository } from "./blob";
import { createMemoryRepository } from "./memory";
import { createPostgresRepository } from "./postgres";
import type { Repository } from "./repository";

export type { Repository, StoreHealth } from "./repository";

export type StoreDriver = "memory" | "postgres" | "blob";

function isProduction(): boolean {
  return process.env.CARESHARE_ENV === "production" || process.env.VERCEL_ENV === "production";
}

/**
 * STORE_DRIVER wins; otherwise DATABASE_URL (Neon) selects postgres and nothing selects memory.
 *
 * memory    `npm run dev` and tests. On Vercel (VERCEL=1) a missing DATABASE_URL is a configuration
 *           error, not a reason to serve from process memory (ALLOW_MEMORY_STORE=1 for a throwaway preview).
 * postgres  every staging and production deployment.
 * blob      only when asked for explicitly: the v1 demo deployment (release/v1.0-rfa-baseline) on its own
 *           Vercel project with synthetic data. Refused wherever the environment says production, because
 *           Vercel Blob is not on Vercel's HIPAA covered-services list.
 */
export function storeDriver(): StoreDriver {
  const v = process.env.STORE_DRIVER ?? (process.env.DATABASE_URL ? "postgres" : "memory");
  if (v !== "memory" && v !== "postgres" && v !== "blob") throw new Error(`STORE_DRIVER must be memory, postgres or blob, got "${v}".`);
  if (v === "blob" && isProduction()) throw new Error("The blob store is not allowed in production (not covered by the Vercel HIPAA BAA). Set DATABASE_URL.");
  if (v === "blob" && !process.env.BLOB_READ_WRITE_TOKEN) throw new Error("STORE_DRIVER=blob but no BLOB_READ_WRITE_TOKEN (connect a Blob store to the project).");
  if (v === "memory" && process.env.VERCEL && process.env.ALLOW_MEMORY_STORE !== "1") {
    throw new Error("Deployed environments must use the postgres store: set DATABASE_URL (or ALLOW_MEMORY_STORE=1 for a throwaway preview).");
  }
  return v;
}

export function getRepository(): Repository {
  const d = storeDriver();
  return d === "postgres" ? createPostgresRepository() : d === "blob" ? createBlobRepository() : createMemoryRepository();
}
