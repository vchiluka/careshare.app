import { createMemoryRepository } from "./memory";
import { createPostgresRepository } from "./postgres";
import type { Repository } from "./repository";

export type { Repository } from "./repository";

/** STORE_DRIVER wins; otherwise a DATABASE_URL (what Vercel's Neon integration injects) selects Postgres. */
export function storeDriver(): "memory" | "postgres" {
  const v = process.env.STORE_DRIVER ?? (process.env.DATABASE_URL ? "postgres" : "memory");
  if (v !== "memory" && v !== "postgres") throw new Error(`STORE_DRIVER must be memory or postgres, got "${v}".`);
  return v;
}

export function getRepository(): Repository {
  return storeDriver() === "postgres" ? createPostgresRepository() : createMemoryRepository();
}
