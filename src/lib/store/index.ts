import { createBlobRepository } from "./blob";
import { createMemoryRepository } from "./memory";
import { createPostgresRepository } from "./postgres";
import type { Repository } from "./repository";

export type { Repository } from "./repository";

export type StoreDriver = "memory" | "blob" | "postgres";

/**
 * STORE_DRIVER wins; otherwise what Vercel injected decides: DATABASE_URL (Neon) → postgres,
 * BLOB_READ_WRITE_TOKEN (Blob store) → blob, nothing → memory (per process; fine for `npm run dev`).
 */
export function storeDriver(): StoreDriver {
  const v = process.env.STORE_DRIVER ?? (process.env.DATABASE_URL ? "postgres" : process.env.BLOB_READ_WRITE_TOKEN ? "blob" : "memory");
  if (v !== "memory" && v !== "postgres" && v !== "blob") throw new Error(`STORE_DRIVER must be memory, blob or postgres, got "${v}".`);
  return v;
}

export function getRepository(): Repository {
  const d = storeDriver();
  return d === "postgres" ? createPostgresRepository() : d === "blob" ? createBlobRepository() : createMemoryRepository();
}
