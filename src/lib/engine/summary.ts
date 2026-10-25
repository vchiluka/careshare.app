/**
 * Monthly structured caregiver summary.
 *
 * The one page a rural clinic reads each month per household: what the caregiver logged, how
 * the household was contacted, open signals, and the burden and depression check-in results.
 * It is also the documentation backbone for whatever the clinic bills after the pilot
 * (care management, caregiver training, cognitive assessment), which is why contact minutes are
 * totaled by the stream they support.
 */

import type { Household, MonthlySummary } from "@/lib/domain/types";
import { monthOf } from "./dates";
import { reconciliationIsCurrent } from "./reconciliation";
import { latest, primaryCaregiver } from "./signals";

export function buildMonthlySummary(h: Household, month: string, asOf: string): MonthlySummary {
  const inMonth = (d: string) => monthOf(d) === month;
  const contacts = h.contacts.filter((c) => inMonth(c.date));
  const cg = primaryCaregiver(h);
  const checkIns = cg ? cg.health.zbi.filter((z) => inMonth(z.date)).length + cg.health.phq2.filter((p) => inMonth(p.date)).length + cg.health.bp.filter((b) => inMonth(b.date)).length : 0;
  const symptoms = h.symptomLog.filter((e) => inMonth(e.date));
  const z = cg ? latest(cg.health.zbi.filter((x) => x.date <= `${month}-31`)) : undefined;
  const p = cg ? latest(cg.health.phq2.filter((x) => x.date <= `${month}-31`)) : undefined;
  const open = h.escalations.filter((e) => e.status !== "resolved").length;
  const notes: string[] = [];
  if (symptoms.filter((s) => s.kind === "fall").length) notes.push(`${symptoms.filter((s) => s.kind === "fall").length} fall(s) logged.`);
  if (symptoms.filter((s) => s.kind === "behavior" && s.severity >= 2).length) notes.push("Moderate or severe behavioral symptoms logged.");
  if (z) notes.push(`Caregiver strain ZBI-12 ${z.total}/48.`);
  if (p && p.total >= 3) notes.push(`Caregiver PHQ-2 positive (${p.total}/6)${p.routedOn ? ", routed to her provider" : ", routing pending"}.`);
  if (contacts.length === 0) notes.push("No clinic contact this month.");
  return {
    month,
    generatedOn: asOf,
    tier: h.carePlan.tier,
    contacts: contacts.length,
    contactMinutes: contacts.reduce((s, c) => s + c.minutes, 0),
    caregiverCheckIns: checkIns,
    symptomsLogged: symptoms.length,
    fallsLogged: symptoms.filter((s) => s.kind === "fall").length,
    openEscalations: open,
    medReconciliationCompleted: reconciliationIsCurrent(h.medReconciliationCompletedOn, `${month}-28`, 31),
    zbiTotal: z?.total,
    phq2Total: p?.total,
    notes: notes.join(" "),
  };
}

export interface TimeByStream {
  care_management: number;
  caregiver_training: number;
  cognitive_assessment: number;
}

export function contactMinutesByStream(h: Household, month: string): TimeByStream {
  const t: TimeByStream = { care_management: 0, caregiver_training: 0, cognitive_assessment: 0 };
  for (const c of h.contacts.filter((c) => monthOf(c.date) === month)) {
    for (const s of c.supports) t[s] += c.minutes;
  }
  return t;
}
