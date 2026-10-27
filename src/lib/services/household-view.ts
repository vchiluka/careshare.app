import type { Caregiver, ClinicSite, CommunityResource, Household, Locality, Signal, StaffUser } from "@/lib/domain/types";
import { cadenceStatus, computeSignals, consentFor, consentState, determineTier, primaryCaregiver, reconcile, type CadenceStatus, type Discrepancy, type TierResult } from "@/lib/engine";
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

export async function loadRoster(): Promise<{ rows: RosterRow[]; asOf: string; localities: Locality[]; sites: ClinicSite[]; staff: StaffUser[] }> {
  const repo = getRepository();
  const [hs, asOf, sites, localities, staff] = await Promise.all([repo.households(), repo.asOf(), repo.sites(), repo.localities(), repo.staff()]);
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
  return { rows, asOf, localities, sites, staff };
}

export interface CareAccess {
  /** May read the household record (plan, medicines, visits, messages, summary). */
  record: boolean;
  /** May use her own check-ins. */
  ownHealth: boolean;
  /** Identity and proxy are fine but the signed authorization is missing or lapsed. */
  needsConsent: boolean;
  consent: ReturnType<typeof consentState>;
  reason: string;
}

/**
 * Can this caregiver see the household record? Three gates in order: identity verified at IAL2,
 * proxy confirmed by the clinic (or self-attested after self-service registration), and a signed
 * authorization that has not lapsed (90 days). Nothing here reads the cookie.
 */
export function caregiverAccess(c: Caregiver | undefined, h?: Pick<Household, "consents">, asOf?: string): CareAccess {
  const none = { needsConsent: false, consent: consentState(undefined, asOf ?? "") };
  if (!c) return { record: false, ownHealth: false, reason: "No caregiver on this household.", ...none };
  const verified = c.identity.status === "verified" && c.identity.assurance === "IAL2";
  if (!verified) return { record: false, ownHealth: false, reason: "Identity not yet verified.", ...none };
  if (c.proxy.status !== "confirmed" && c.proxy.status !== "self_attested") return { record: false, ownHealth: true, reason: "The clinic has not yet confirmed you as a representative.", ...none };
  const consent = consentState(h ? consentFor(h, c.id) : undefined, asOf ?? "");
  if (consent.state !== "active" && consent.state !== "expiring") {
    const why = consent.state === "revoked" ? "You revoked your authorization." : consent.state === "expired" ? "Your authorization lapsed after 90 days." : "You have not signed the authorization yet.";
    return { record: false, ownHealth: true, needsConsent: true, consent, reason: `${why} Sign it again to reopen the record.` };
  }
  return { record: true, ownHealth: true, needsConsent: false, consent, reason: "" };
}
