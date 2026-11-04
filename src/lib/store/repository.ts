import type { AuditEntry, CaregiverAccount, ClinicSite, CommunityResource, EducationItem, Household, Locality, StaffUser } from "@/lib/domain/types";

/**
 * Repository: the only way pages and actions touch data.
 *
 * STORE_DRIVER=memory (default for `npm run dev` and unit tests) loads the synthetic seed into process
 * memory and keeps edits there until the process restarts. STORE_DRIVER=postgres (or any DATABASE_URL)
 * uses the Neon Postgres store, whose schema comes from db/migrations and whose data comes from
 * `npm run db:seed` (staging, previews) or from real use (production). Every deployed environment
 * must use postgres; the selector in index.ts refuses memory when VERCEL is set.
 */
export interface StoreHealth {
  driver: "memory" | "postgres";
  ok: boolean;
  schemaVersion?: string;
  pendingMigrations: string[];
}

export interface Repository {
  readonly driver: "memory" | "postgres";
  /** The demo clock (DEMO_AS_OF) or today. */
  asOf(): Promise<string>;
  localities(): Promise<Locality[]>;
  sites(): Promise<ClinicSite[]>;
  education(): Promise<EducationItem[]>;
  resources(): Promise<CommunityResource[]>;

  staff(): Promise<StaffUser[]>;
  staffMember(id: string): Promise<StaffUser | undefined>;
  upsertStaff(s: StaffUser): Promise<void>;

  accounts(): Promise<CaregiverAccount[]>;
  account(id: string): Promise<CaregiverAccount | undefined>;
  upsertAccount(a: CaregiverAccount): Promise<void>;

  households(): Promise<Household[]>;
  household(id: string): Promise<Household | undefined>;
  /** Apply a mutation atomically and persist. The mutator receives a draft it may change in place. */
  updateHousehold(id: string, mutate: (h: Household) => unknown): Promise<Household>;
  addHousehold(h: Household): Promise<void>;

  audit(entry: Omit<AuditEntry, "id" | "at">): Promise<AuditEntry>;
  auditLog(filter?: { householdId?: string; limit?: number }): Promise<AuditEntry[]>;
  /** Replace all documents with the synthetic seed. Refused in production. The audit trail is kept. */
  reset(): Promise<void>;
  /** For /api/health and /clinic/integrations: driver, schema version, pending migrations. */
  health(): Promise<StoreHealth>;
}
