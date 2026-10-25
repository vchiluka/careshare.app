import type { AuditEntry, ClinicSite, CommunityResource, Household, Locality, StaffUser } from "@/lib/domain/types";

/**
 * Repository: the only way pages and actions touch data.
 *
 * STORE_DRIVER=memory (default) loads the synthetic seed into process memory and keeps edits there
 * until the process restarts. A Postgres driver implements the same interface in postgres.ts
 * (Drizzle; tables mirror domain/types.ts; audit is append-only).
 */
export interface Repository {
  readonly driver: "memory" | "postgres";
  /** The demo clock (DEMO_AS_OF) or today. */
  asOf(): Promise<string>;
  localities(): Promise<Locality[]>;
  sites(): Promise<ClinicSite[]>;
  staff(): Promise<StaffUser[]>;
  resources(): Promise<CommunityResource[]>;
  households(): Promise<Household[]>;
  household(id: string): Promise<Household | undefined>;
  /** Apply a mutation atomically and persist. The mutator receives a draft it may change in place. */
  updateHousehold(id: string, mutate: (h: Household) => unknown): Promise<Household>;
  addHousehold(h: Household): Promise<void>;
  audit(entry: Omit<AuditEntry, "id" | "at">): Promise<AuditEntry>;
  auditLog(filter?: { householdId?: string; limit?: number }): Promise<AuditEntry[]>;
  reset(): Promise<void>;
}
