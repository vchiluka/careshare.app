import { createMemoryRepository } from "./memory";
import type { Repository } from "./repository";

export type { Repository } from "./repository";

export function storeDriver(): "memory" | "postgres" {
  const v = process.env.STORE_DRIVER ?? "memory";
  if (v !== "memory" && v !== "postgres") throw new Error(`STORE_DRIVER must be memory or postgres, got "${v}".`);
  return v;
}

export function getRepository(): Repository {
  if (storeDriver() === "postgres") {
    throw new Error("Postgres store not implemented yet. Add src/lib/store/postgres.ts implementing Repository (see docs/INTEGRATIONS.md).");
  }
  return createMemoryRepository();
}
