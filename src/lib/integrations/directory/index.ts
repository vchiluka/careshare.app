/**
 * Community resource directory.
 *
 * CareShare does not build a directory. It surfaces the directory of record for the locality and
 * closes the loop: when a caregiver uses a listed resource, the outcome (consented, de-identified)
 * goes back to the directory partner, which is the thread they lose today.
 *
 * Virginia's directory of record is VirginiaNavigator / SeniorNavigator (26,000+ programs,
 * county-level pages). The mock reads listings from the seed. A live adapter would call their
 * data feed or API with attribution once one is agreed.
 *
 *   DIRECTORY_ADAPTER=mock (default) | virginianavigator
 *   VN_API_BASE_URL, VN_API_KEY         for the live adapter
 */

import type { CommunityResource, Referral, ResourceCategory } from "@/lib/domain/types";

export interface DirectoryAdapter {
  readonly mode: "mock" | "live";
  readonly label: string;
  search(input: { localityFips: string; category?: ResourceCategory }): Promise<CommunityResource[]>;
  /** Closed-loop report. Returns a receipt reference; payload carries no PHI. */
  reportOutcome(input: { listingId: string; localityFips: string; status: Referral["status"]; category: ResourceCategory }): Promise<{ receipt: string }>;
}

export function createMockDirectoryAdapter(all: () => Promise<CommunityResource[]>): DirectoryAdapter {
  return {
    mode: "mock",
    label: "VirginiaNavigator (mock listings)",
    async search({ localityFips, category }) {
      const rs = await all();
      return rs.filter((r) => r.localityFips.includes(localityFips) && (!category || r.category === category));
    },
    async reportOutcome({ listingId, status }) {
      return { receipt: `vn-mock-${listingId}-${status}-${Date.now().toString(36)}` };
    },
  };
}

export function createLiveDirectoryAdapter(): DirectoryAdapter {
  const base = process.env.VN_API_BASE_URL;
  const key = process.env.VN_API_KEY;
  if (!base || !key) throw new Error("DIRECTORY_ADAPTER=virginianavigator but VN_API_BASE_URL or VN_API_KEY not set.");
  return {
    mode: "live",
    label: `VirginiaNavigator at ${new URL(base).host}`,
    async search() {
      throw new Error("VirginiaNavigator API contract not yet agreed; implement search() once the data-feed terms are set.");
    },
    async reportOutcome() {
      throw new Error("VirginiaNavigator closed-loop endpoint not yet agreed.");
    },
  };
}

export function directoryMode(): "mock" | "virginianavigator" {
  const v = process.env.DIRECTORY_ADAPTER ?? "mock";
  if (v !== "mock" && v !== "virginianavigator") throw new Error(`DIRECTORY_ADAPTER must be mock or virginianavigator, got "${v}".`);
  return v;
}

export function getDirectoryAdapter(all: () => Promise<CommunityResource[]>): DirectoryAdapter {
  return directoryMode() === "virginianavigator" ? createLiveDirectoryAdapter() : createMockDirectoryAdapter(all);
}
