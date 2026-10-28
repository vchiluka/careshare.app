import { NextResponse } from "next/server";
import { consentFor, consentState, determineTier, primaryCaregiver, zbi12Total } from "@/lib/engine";
import { sha256base64url } from "@/lib/integrations/crypto";
import { requireClinic } from "@/lib/services/clinic-context";
import { getRepository } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * De-identified evaluator export (CSV). Administrators only. One row per household whose primary
 * caregiver's current authorization includes evaluator sharing. No names, dates of birth, ids or free text:
 * a salted hash stands in for the household, dates are reduced to months, locality is the FIPS code.
 */
export async function GET() {
  const me = await requireClinic({ admin: true });
  const repo = getRepository();
  const [hs, asOf] = await Promise.all([repo.households(), repo.asOf()]);
  const salt = process.env.CARESHARE_SECRET ?? "careshare";
  const month = (d?: string) => (d ? d.slice(0, 7) : "");
  const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
  const rows: string[][] = [["household_hash", "locality_fips", "origin", "enrolled_month", "status", "tier", "cdr", "fast", "caregiver_relationship", "caregiver_identity_verified", "proxy_status", "consent_basis", "zbi_baseline", "zbi_latest", "zbi_latest_month", "zbi_change", "phq2_positive_count", "phq2_routed_count", "bp_crisis_readings", "med_recon_current_90d", "medicare_connected", "awv_12m", "cog_assessment_12m", "caregiver_own_visit_12m", "contacts_90d", "escalations_open", "escalations_resolved", "median_resolve_days", "referrals", "referrals_with_outcome", "ed_visits_6m", "shares_created"]];
  let included = 0;
  for (const h of hs) {
    const cg = primaryCaregiver(h);
    if (!cg) continue;
    const consent = consentFor(h, cg.id);
    const cs = consentState(consent, asOf).state;
    if (!consent?.shareWith.evaluator || (cs !== "active" && cs !== "expiring")) continue;
    included++;
    const zbis = cg.health.zbi;
    const base = zbis[0];
    const latest = zbis.at(-1);
    const phqPos = cg.health.phq2.filter((p) => p.total >= 3);
    const resolved = h.escalations.filter((e) => e.status === "resolved" && e.resolvedOn);
    const resolveDays = resolved.map((e) => days(e.raisedOn, e.resolvedOn!)).sort((a, b) => a - b);
    const tier = determineTier(h.staging, true, latest ? zbi12Total(latest.items) : undefined).tier;
    rows.push([
      (await sha256base64url(`${salt}:${h.id}`)).slice(0, 16),
      h.patient.localityFips,
      h.origin ?? "clinic_enrolled",
      month(h.enrolledOn),
      h.status,
      tier ?? "",
      h.staging?.cdrGlobal?.toString() ?? "",
      h.staging?.fast ?? "",
      cg.relationship,
      cg.identity.status === "verified" ? "1" : "0",
      cg.proxy.status,
      consent.basis,
      base ? String(base.total) : "",
      latest ? String(latest.total) : "",
      month(latest?.date),
      base && latest && latest !== base && days(base.date, latest.date) >= 60 ? String(latest.total - base.total) : "",
      String(phqPos.length),
      String(phqPos.filter((p) => p.routedOn).length),
      String(cg.health.bp.filter((b) => b.systolic >= 180 || b.diastolic >= 120).length),
      h.medReconciliationCompletedOn && days(h.medReconciliationCompletedOn, asOf) <= 90 ? "1" : "0",
      h.medicare.connected ? "1" : "0",
      h.lastAnnualWellnessOn && days(h.lastAnnualWellnessOn, asOf) <= 365 ? "1" : "0",
      h.lastCognitiveAssessmentOn && days(h.lastCognitiveAssessmentOn, asOf) <= 365 ? "1" : "0",
      cg.health.ownPcpLastVisit && days(cg.health.ownPcpLastVisit, asOf) <= 365 ? "1" : "0",
      String(h.contacts.filter((c) => days(c.date, asOf) <= 90).length),
      String(h.escalations.filter((e) => e.status !== "resolved").length),
      String(resolved.length),
      resolveDays.length ? String(resolveDays[Math.floor(resolveDays.length / 2)]) : "",
      String(h.referrals.length),
      String(h.referrals.filter((r) => r.status !== "suggested").length),
      String(h.edVisits.filter((e) => days(e.date, asOf) <= 183).length),
      String((h.shares ?? []).length),
    ]);
  }
  await repo.audit({ actor: `staff:${me.id}`, action: "export.evaluator", reference: `${included} households` });
  const csv = rows.map((r) => r.map((v) => (/[",\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v)).join(",")).join("\n");
  return new NextResponse(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="careshare-evaluator-${asOf}.csv"` } });
}
