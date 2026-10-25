import type { Caregiver, ClinicSite, CommunityResource, Household, Locality, Signal, StaffUser } from "@/lib/domain/types";
import { cadenceStatus, computeSignals, determineTier, primaryCaregiver, reconcile, type CadenceStatus, type Discrepancy, type TierResult } from "@/lib/engine";
import { getRepository } from "@/lib/store";

export interface HouseholdView {
  h: Household;
  asOf: string;
  site: ClinicSite;
  locality: Locality;
  primary?: Caregiver;
  tier: TierResult;
  cadence: CadenceStatus;
  signals: Signal[];
  discrepancies: Discrepancy[];
  staffById: Record<string, StaffUser>;
  resourcesById: Record<string, CommunityResource>;
  openEscalations: number;
}

export async function loadHouseholdView(id: string): Promise<HouseholdView | null> {
  const repo = getRepository();
  const [h, asOf, sites, localities, staff, resources] = await Promise.all([repo.household(id), repo.asOf(), repo.sites(), repo.localities(), repo.staff(), repo.resources()]);
  if (!h) return null;
  const primary = primaryCaregiver(h);
  return {
    h,
    asOf,
    site: sites.find((s) => s.id === h.siteId)!,
    locality: localities.find((l) => l.fips === h.patient.localityFips)!,
    primary,
    tier: determineTier(h.staging, !!primary, primary?.health.zbi.at(-1)?.total),
    cadence: cadenceStatus(h.carePlan.tier, h.contacts, asOf, h.enrolledOn),
    signals: computeSignals(h, asOf),
    discrepancies: reconcile(h, asOf),
    staffById: Object.fromEntries(staff.map((s) => [s.id, s])),
    resourcesById: Object.fromEntries(resources.map((r) => [r.id, r])),
    openEscalations: h.escalations.filter((e) => e.status !== "resolved").length,
  };
}

export interface RosterRow {
  h: Household;
  primary?: Caregiver;
  signals: Signal[];
  cadence: CadenceStatus;
  localityName: string;
  siteName: string;
}

export async function loadRoster(): Promise<{ rows: RosterRow[]; asOf: string; localities: Locality[]; sites: ClinicSite[] }> {
  const repo = getRepository();
  const [hs, asOf, sites, localities] = await Promise.all([repo.households(), repo.asOf(), repo.sites(), repo.localities()]);
  const rows = hs.map((h) => ({
    h,
    primary: primaryCaregiver(h),
    signals: computeSignals(h, asOf),
    cadence: cadenceStatus(h.carePlan.tier, h.contacts, asOf, h.enrolledOn),
    localityName: localities.find((l) => l.fips === h.patient.localityFips)?.name ?? h.patient.localityFips,
    siteName: sites.find((s) => s.id === h.siteId)?.name ?? h.siteId,
  }));
  const sev = { critical: 0, warning: 1, info: 2 };
  rows.sort((a, b) => {
    const sa = a.signals[0] ? sev[a.signals[0].severity] : 3;
    const sb = b.signals[0] ? sev[b.signals[0].severity] : 3;
    return sa - sb || b.signals.length - a.signals.length || a.h.patient.familyName.localeCompare(b.h.patient.familyName);
  });
  return { rows, asOf, localities, sites };
}

/** Can this caregiver see the household record? Identity verified at IAL2 and proxy confirmed. */
export function caregiverAccess(c: Caregiver | undefined): { record: boolean; ownHealth: boolean; reason: string } {
  if (!c) return { record: false, ownHealth: false, reason: "No caregiver on this household." };
  const verified = c.identity.status === "verified" && c.identity.assurance === "IAL2";
  if (!verified) return { record: false, ownHealth: false, reason: "Identity not yet verified." };
  if (c.proxy.status !== "confirmed") return { record: false, ownHealth: true, reason: "The clinic has not yet confirmed you as a representative." };
  return { record: true, ownHealth: true, reason: "" };
}
