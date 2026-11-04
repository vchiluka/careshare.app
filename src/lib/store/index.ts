import { createMemoryRepository } from "./memory";
import { createPostgresRepository } from "./postgres";
import type { Repository } from "./repository";

export type { Repository, StoreHealth } from "./repository";

export type StoreDriver = "memory" | "postgres";

/**
 * STORE_DRIVER wins; otherwise DATABASE_URL (Neon) selects postgres and nothing selects memory.
 * Memory is for `npm run dev` and tests only: on Vercel (VERCEL=1) a missing DATABASE_URL is a
 * configuration error, not a reason to serve from process memory, so it throws at the first request.
 */
export function storeDriver(): StoreDriver {
  const v = process.env.STORE_DRIVER ?? (process.env.DATABASE_URL ? "postgres" : "memory");
  if (v !== "memory" && v !== "postgres") throw new Error(`STORE_DRIVER must be memory or postgres, got "${v}".`);
  if (v === "memory" && process.env.VERCEL && process.env.ALLOW_MEMORY_STORE !== "1") {
    throw new Error("Deployed environments must use the postgres store: set DATABASE_URL (or ALLOW_MEMORY_STORE=1 for a throwaway preview).");
  }
  return v;
}

export function getRepository(): Repository {
  return storeDriver() === "postgres" ? createPostgresRepository() : createMemoryRepository();
}
