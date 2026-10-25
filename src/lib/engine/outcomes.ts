/**
 * Pilot outcome measures.
 *
 * Chosen so they can move within a six-month window and are captured inside the platform, with
 * emergency visits as a secondary, partner-reported measure. Grouped by the three Key Performance
 * Objectives in RFA C-27-002 §4.2C:
 *   KPO 1  Decrease rates of chronic disease in rural adults (complications of uncoordinated care)
 *   KPO 2  Increase access to primary care including preventive visits
 *   KPO 3  Modernize provider operations and adopt technology in rural communities
 * plus the People Served count (Appendix A localities only).
 */

import type { Household, Locality } from "@/lib/domain/types";
import { cadenceAdherence } from "./cadence";
import { addDays, daysBetween } from "./dates";
import { reconciliationIsCurrent } from "./reconciliation";
import { PHQ2_POSITIVE } from "./tiering";
import { primaryCaregiver } from "./signals";

export interface Measure {
  id: string;
  kpo: 1 | 2 | 3 | "people";
  label: string;
  value: number | null;
  unit: "%" | "n" | "pts" | "per100" | "days";
  numerator?: number;
  denominator?: number;
  definition: string;
  direction: "up" | "down";
}

export interface OutcomeReport {
  asOf: string;
  measures: Measure[];
  byLocality: { fips: string; name: string; households: number; active: number; verifiedCaregivers: number; appendixA: boolean }[];
  byTier: Record<string, number>;
}

const pct = (n: number, d: number) => (d === 0 ? null : Math.round((n / d) * 100));

export function outcomeReport(households: Household[], localities: Locality[], asOf: string): OutcomeReport {
  const appendixA = new Set(localities.filter((l) => l.appendixA).map((l) => l.fips));
  const hh = households.filter((h) => appendixA.has(h.patient.localityFips));
  const active = hh.filter((h) => h.status === "active");
  const enrolledCaregivers = hh.flatMap((h) => h.caregivers);
  const verified = enrolledCaregivers.filter((c) => c.identity.status === "verified");
  const confirmed = enrolledCaregivers.filter((c) => c.proxy.status === "confirmed");
  const thirtyAgo = addDays(asOf, -30);

  const activeMonthly = active.filter((h) => {
    const cg = h.caregivers;
    const touched =
      h.symptomLog.some((e) => e.date >= thirtyAgo) ||
      h.messages.some((m) => m.from === "caregiver" && m.at.slice(0, 10) >= thirtyAgo) ||
      cg.some((c) => c.health.zbi.some((z) => z.date >= thirtyAgo) || c.health.phq2.some((p) => p.date >= thirtyAgo) || c.health.bp.some((b) => b.date >= thirtyAgo));
    return touched;
  });

  const withBaselineAndFollow = active
    .map((h) => primaryCaregiver(h))
    .filter((c): c is NonNullable<typeof c> => !!c)
    .map((c) => [...c.health.zbi].sort((a, b) => a.date.localeCompare(b.date)))
    .filter((z) => z.length >= 2 && daysBetween(z[0].date, z[z.length - 1].date) >= 60);
  const zbiChange = withBaselineAndFollow.length ? withBaselineAndFollow.reduce((s, z) => s + (z[z.length - 1].total - z[0].total), 0) / withBaselineAndFollow.length : null;

  const phqPositives = active
    .map((h) => primaryCaregiver(h))
    .filter((c): c is NonNullable<typeof c> => !!c)
    .flatMap((c) => c.health.phq2.filter((p) => p.total >= PHQ2_POSITIVE));
  const phqRouted = phqPositives.filter((p) => p.routedOn);

  const caregiversWithOwnVisit = active.map((h) => primaryCaregiver(h)).filter((c) => c && c.health.ownPcpLastVisit && daysBetween(c.health.ownPcpLastVisit, asOf) <= 365);

  const reconCurrent = active.filter((h) => reconciliationIsCurrent(h.medReconciliationCompletedOn, asOf, 90));
  const awv = active.filter((h) => h.lastAnnualWellnessOn && daysBetween(h.lastAnnualWellnessOn, asOf) <= 365);
  const cog = active.filter((h) => h.lastCognitiveAssessmentOn && daysBetween(h.lastCognitiveAssessmentOn, asOf) <= 365);
  const planCurrent = active.filter((h) => h.carePlan.reviewedOn && daysBetween(h.carePlan.reviewedOn, asOf) <= 90);
  const cadenceVals = active.map((h) => cadenceAdherence(h.carePlan.tier, h.contacts, asOf, 90)).filter((v): v is number => v !== null);
  const cadenceMean = cadenceVals.length ? Math.round(cadenceVals.reduce((a, b) => a + b, 0) / cadenceVals.length) : null;
  const sixMonthsAgo = addDays(asOf, -182);
  const edVisits = active.flatMap((h) => h.edVisits.filter((v) => v.date >= sixMonthsAgo));
  const medicareConnected = active.filter((h) => h.medicare.connected);
  const ehrLinked = active.filter((h) => !!h.patient.ehrPatientId);
  const referralsClosed = hh.flatMap((h) => h.referrals).filter((r) => r.status === "enrolled" || r.status === "declined" || r.status === "closed" || r.status === "not_reached");
  const referralsAll = hh.flatMap((h) => h.referrals);
  const resolved = hh.flatMap((h) => h.escalations).filter((e) => e.status === "resolved" && e.resolvedOn);
  const medianResolve = resolved.length
    ? resolved.map((e) => daysBetween(e.raisedOn, e.resolvedOn!)).sort((a, b) => a - b)[Math.floor(resolved.length / 2)]
    : null;

  const measures: Measure[] = [
    { id: "households", kpo: "people", label: "Households enrolled (Appendix A localities)", value: hh.length, unit: "n", definition: "Patient and caregiver pairs enrolled in a rural locality listed in Appendix A.", direction: "up" },
    { id: "active", kpo: "people", label: "Households active", value: active.length, unit: "n", definition: "Enrolled households with status active.", direction: "up" },
    { id: "active_monthly", kpo: "people", label: "Caregivers active in last 30 days", value: pct(activeMonthly.length, active.length), unit: "%", numerator: activeMonthly.length, denominator: active.length, definition: "Share of active households whose caregiver logged a symptom, message or check-in in the last 30 days.", direction: "up" },
    { id: "verified", kpo: 3, label: "Caregivers identity-verified (IAL2)", value: pct(verified.length, enrolledCaregivers.length), unit: "%", numerator: verified.length, denominator: enrolledCaregivers.length, definition: "Caregivers who completed identity proofing with CLEAR or ID.me, or in person at the clinic.", direction: "up" },
    { id: "proxy", kpo: 3, label: "Proxy relationships confirmed by the clinic", value: pct(confirmed.length, verified.length), unit: "%", numerator: confirmed.length, denominator: verified.length, definition: "Verified caregivers whose representative status the clinic confirmed once, replacing per-provider paper proxy forms.", direction: "up" },
    { id: "recon", kpo: 1, label: "Medication reconciliation current (90 days)", value: pct(reconCurrent.length, active.length), unit: "%", numerator: reconCurrent.length, denominator: active.length, definition: "Active households where the clinic list was reconciled against Medicare pharmacy claims and the caregiver's report in the last 90 days.", direction: "up" },
    { id: "zbi", kpo: 1, label: "Caregiver strain change (ZBI-12)", value: zbiChange === null ? null : Math.round(zbiChange * 10) / 10, unit: "pts", denominator: withBaselineAndFollow.length, definition: "Mean change from baseline to the latest check-in at least 60 days later; negative is improvement.", direction: "down" },
    { id: "phq_routed", kpo: 1, label: "Positive caregiver depression screens routed to care", value: pct(phqRouted.length, phqPositives.length), unit: "%", numerator: phqRouted.length, denominator: phqPositives.length, definition: "PHQ-2 scores of 3 or more for which a warm hand-off to the caregiver's own provider or behavioral health was recorded.", direction: "up" },
    { id: "cg_own_visit", kpo: 2, label: "Caregivers with their own primary care visit in 12 months", value: pct(caregiversWithOwnVisit.length, active.length), unit: "%", numerator: caregiversWithOwnVisit.length, denominator: active.length, definition: "The caregiver is the second patient in the household; this tracks whether she is seen too.", direction: "up" },
    { id: "awv", kpo: 2, label: "Annual wellness visit in 12 months", value: pct(awv.length, active.length), unit: "%", numerator: awv.length, denominator: active.length, definition: "Patients with an annual wellness visit in the last 12 months.", direction: "up" },
    { id: "cog", kpo: 2, label: "Cognitive assessment and care-plan visit in 12 months", value: pct(cog.length, active.length), unit: "%", numerator: cog.length, denominator: active.length, definition: "Patients with a documented cognitive assessment and care-planning visit in the last 12 months.", direction: "up" },
    { id: "plan", kpo: 3, label: "Care plan reviewed in 90 days", value: pct(planCurrent.length, active.length), unit: "%", numerator: planCurrent.length, denominator: active.length, definition: "Active households whose shared plan was reviewed by the clinic in the last 90 days.", direction: "up" },
    { id: "cadence", kpo: 3, label: "Contact cadence met (90 days)", value: cadenceMean, unit: "%", definition: "Mean share of cadence periods in the last 90 days with at least one documented clinic contact.", direction: "up" },
    { id: "medicare", kpo: 3, label: "Households with Medicare records connected", value: pct(medicareConnected.length, active.length), unit: "%", numerator: medicareConnected.length, denominator: active.length, definition: "Blue Button 2.0 authorization completed by the patient or verified representative.", direction: "up" },
    { id: "ehr", kpo: 3, label: "Households linked to the clinic EHR", value: pct(ehrLinked.length, active.length), unit: "%", numerator: ehrLinked.length, denominator: active.length, definition: "Patient matched to an EHR record so visit summaries and plans flow both ways.", direction: "up" },
    { id: "referrals", kpo: 3, label: "Community referrals with a recorded outcome", value: pct(referralsClosed.length, referralsAll.length), unit: "%", numerator: referralsClosed.length, denominator: referralsAll.length, definition: "Referrals to directory resources whose outcome was recorded (the closed loop the directory partner cannot see today).", direction: "up" },
    { id: "resolve", kpo: 3, label: "Median days to resolve an escalation", value: medianResolve, unit: "days", definition: "From the day a signal was raised to the day the clinic resolved it.", direction: "down" },
    { id: "ed", kpo: 1, label: "Emergency visits per 100 active households (6 months)", value: active.length ? Math.round((edVisits.length / active.length) * 100) : null, unit: "per100", numerator: edVisits.length, denominator: active.length, definition: "Secondary measure, partner-reported from hospital discharge feeds; interpret with caution at pilot scale.", direction: "down" },
  ];

  const byLocality = localities
    .filter((l) => l.pilotPhase > 0)
    .map((l) => {
      const lh = households.filter((h) => h.patient.localityFips === l.fips);
      return {
        fips: l.fips,
        name: l.name,
        households: lh.length,
        active: lh.filter((h) => h.status === "active").length,
        verifiedCaregivers: lh.flatMap((h) => h.caregivers).filter((c) => c.identity.status === "verified").length,
        appendixA: l.appendixA,
      };
    });

  const byTier: Record<string, number> = {};
  for (const h of active) byTier[h.carePlan.tier ?? "unset"] = (byTier[h.carePlan.tier ?? "unset"] ?? 0) + 1;

  return { asOf, measures, byLocality, byTier };
}
