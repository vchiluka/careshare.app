/**
 * Signals: the things a rural clinic needs in front of it, computed from what the caregiver logs
 * and what the record shows. Each signal names the rule, says what to do next, and who owns it.
 *
 * Clinical thresholds (sources noted inline) are starting points for the pilot protocol; the
 * clinical advisor owns the final values. The platform never diagnoses. A positive PHQ-2 routes
 * the caregiver to her own provider; it is not recorded as a diagnosis anywhere.
 */

import type { Caregiver, Household, Signal } from "@/lib/domain/types";
import { cadenceStatus } from "./cadence";
import { addDays, daysBetween } from "./dates";
import { reconcile, reconciliationIsCurrent } from "./reconciliation";
import { determineStage, isHospiceThreshold, PHQ2_POSITIVE, ZBI12_HIGH_CUTOFF } from "./tiering";

export function primaryCaregiver(h: Household): Caregiver | undefined {
  return h.caregivers.find((c) => c.isPrimary) ?? h.caregivers[0];
}

export function latest<T extends { date: string }>(xs: T[]): T | undefined {
  return [...xs].sort((a, b) => a.date.localeCompare(b.date)).at(-1);
}

export function computeSignals(h: Household, asOf: string): Signal[] {
  const s: Signal[] = [];
  const cg = primaryCaregiver(h);
  const within = (date: string, days: number) => daysBetween(date, asOf) >= 0 && daysBetween(date, asOf) <= days;

  // --- Patient safety, from the caregiver's log ---
  const falls = h.symptomLog.filter((e) => e.kind === "fall" && within(e.date, 7));
  if (falls.length > 0) {
    const f = latest(falls)!;
    s.push({
      rule: "FALL_REPORTED",
      severity: "critical",
      message: `Fall reported ${f.date}${f.severity === 3 ? " (severe)" : ""}: ${f.note}`,
      action: "Same-day call to the caregiver; assess injury, medications that raise fall risk, and home safety. Document the call as a contact.",
      owner: "clinic",
      key: `FALL_REPORTED:${f.date}`,
      evidenceDate: f.date,
    });
  }

  // UTI signs: urinary symptom plus acute confusion/behavior change within 3 days of each other.
  const urinary = h.symptomLog.filter((e) => e.kind === "urinary" && within(e.date, 5));
  const acute = h.symptomLog.filter((e) => (e.kind === "confusion" || e.kind === "behavior") && e.severity >= 2 && within(e.date, 5));
  const utiPair = urinary.find((u) => acute.some((a) => Math.abs(daysBetween(u.date, a.date)) <= 3));
  if (utiPair) {
    s.push({
      rule: "UTI_SIGNS",
      severity: "critical",
      message: `Urinary symptoms (${utiPair.date}) with a sudden change in confusion or behavior in the same week.`,
      action: "Possible infection: arrange a same- or next-day visit or telehealth assessment; a urinalysis before antibiotics. Tell the caregiver what to watch overnight.",
      owner: "clinic",
      key: `UTI_SIGNS:${utiPair.date}`,
      evidenceDate: utiPair.date,
    });
  }

  const crisis = h.symptomLog.filter((e) => e.kind === "behavior" && e.severity === 3 && within(e.date, 7));
  if (crisis.length > 0 && !utiPair) {
    const c = latest(crisis)!;
    s.push({
      rule: "BEHAVIOR_CRISIS",
      severity: "critical",
      message: `Severe behavioral symptoms logged ${c.date}: ${c.note}`,
      action: "Call the caregiver today. Rule out pain, infection and medication change; review the behavior plan; offer respite. Escalate to the clinical advisor if safety is at risk.",
      owner: "clinic",
      key: `BEHAVIOR_CRISIS:${c.date}`,
      evidenceDate: c.date,
    });
  }

  const wander = h.symptomLog.filter((e) => e.kind === "wandering" && within(e.date, 14));
  if (wander.length > 0) {
    const w = latest(wander)!;
    s.push({
      rule: "WANDERING",
      severity: "warning",
      message: `Wandering or exit-seeking logged ${w.date}.`,
      action: "Review door alarms, ID bracelet, and a local Project Lifesaver or Silver Alert registration; add to the plan's watch list.",
      owner: "both",
      key: `WANDERING:${w.date}`,
      evidenceDate: w.date,
    });
  }

  // --- Caregiver health (the second patient in the household) ---
  if (cg) {
    const phq = latest(cg.health.phq2);
    if (phq && phq.total >= PHQ2_POSITIVE && !phq.routedOn) {
      s.push({
        rule: "PHQ2_POSITIVE",
        severity: "warning",
        message: `${cg.givenName}'s depression screen (PHQ-2) was positive on ${phq.date} (score ${phq.total}/6).`,
        action: "Not a diagnosis. Offer a warm hand-off to her own primary care provider or the clinic's behavioral health team within one week; record that the referral was made.",
        owner: "clinic",
        key: `PHQ2_POSITIVE:${phq.date}`,
        evidenceDate: phq.date,
      });
    }
    const bps = [...cg.health.bp].sort((a, b) => a.date.localeCompare(b.date));
    const lastBp = bps.at(-1);
    if (lastBp && within(lastBp.date, 14) && (lastBp.systolic >= 180 || lastBp.diastolic >= 120)) {
      s.push({
        rule: "BP_CRISIS",
        severity: "critical",
        message: `${cg.givenName}'s home blood pressure ${lastBp.systolic}/${lastBp.diastolic} on ${lastBp.date}.`,
        action: "Call her today: re-check after five minutes seated; if still at or above 180/120, or any symptoms, she needs same-day care. Record the call.",
        owner: "clinic",
        key: `BP_CRISIS:${lastBp.date}`,
        evidenceDate: lastBp.date,
      });
    } else {
      const recentHigh = bps.filter((b) => within(b.date, 30) && (b.systolic >= 140 || b.diastolic >= 90));
      if (recentHigh.length >= 2) {
        s.push({
          rule: "BP_ELEVATED",
          severity: "warning",
          message: `${cg.givenName} has logged ${recentHigh.length} elevated blood pressure readings in 30 days (latest ${lastBp!.systolic}/${lastBp!.diastolic}).`,
          action: "Encourage her to book her own primary care visit; share the readings with her consent. Track whether the visit happens.",
          owner: "both",
          key: `BP_ELEVATED:${lastBp!.date}`,
          evidenceDate: lastBp!.date,
        });
      }
    }
    const zbis = [...cg.health.zbi].sort((a, b) => a.date.localeCompare(b.date));
    const z = zbis.at(-1);
    const zPrev = zbis.at(-2);
    if (z && z.total >= ZBI12_HIGH_CUTOFF) {
      s.push({
        rule: "BURDEN_HIGH",
        severity: "warning",
        message: `Caregiver strain is high: ZBI-12 ${z.total}/48 on ${z.date}.`,
        action: "Offer respite now (Area Agency on Aging respite hours, adult day); schedule a caregiver skills group; re-measure in 30 days.",
        owner: "clinic",
        key: `BURDEN_HIGH:${z.date}`,
        evidenceDate: z.date,
      });
    } else if (z && zPrev && z.total - zPrev.total >= 4) {
      s.push({
        rule: "BURDEN_RISING",
        severity: "warning",
        message: `Caregiver strain rising: ZBI-12 ${zPrev.total} → ${z.total} since ${zPrev.date}.`,
        action: "Ask what changed at the next contact; check sleep and behavior logs; line up respite before it becomes a crisis.",
        owner: "clinic",
        key: `BURDEN_RISING:${z.date}`,
        evidenceDate: z.date,
      });
    }
    if (cg.health.ownPcpLastVisit && daysBetween(cg.health.ownPcpLastVisit, asOf) > 365 && !cg.health.ownPcpNextScheduled) {
      s.push({
        rule: "CAREGIVER_OWN_VISIT_OVERDUE",
        severity: "info",
        message: `${cg.givenName} has not had her own primary care visit in over a year.`,
        action: "Ask her to schedule one; offer to arrange care for her family member during the visit.",
        owner: "both",
        key: "CAREGIVER_OWN_VISIT_OVERDUE",
      });
    }
    // --- Measurement cadence for the caregiver strain measure (ZBI-12 baseline, then every 60 days) ---
    const lastZbi = cg.health.zbi.at(-1);
    if (h.status === "active" && h.enrolledOn && !lastZbi && daysBetween(h.enrolledOn, asOf) >= 14) {
      s.push({
        rule: "ZBI_BASELINE_DUE",
        severity: "info",
        message: `${cg.givenName} has no baseline strain check-in (ZBI-12) ${daysBetween(h.enrolledOn, asOf)} days after enrollment.`,
        action: "Ask her to complete the check-in in the app, or administer it by phone at the next contact; the outcome measure needs a baseline.",
        owner: "both",
        key: "ZBI_BASELINE_DUE",
      });
    } else if (h.status === "active" && lastZbi && daysBetween(lastZbi.date, asOf) > 60) {
      s.push({
        rule: "ZBI_FOLLOWUP_DUE",
        severity: "info",
        message: `${cg.givenName}'s last strain check-in was ${daysBetween(lastZbi.date, asOf)} days ago.`,
        action: "Prompt the monthly check-in by text or at the next contact.",
        owner: "both",
        key: `ZBI_FOLLOWUP_DUE:${lastZbi.date}`,
        evidenceDate: lastZbi.date,
      });
    }
    // --- Access ---
    if (cg.identity.status !== "verified") {
      s.push({
        rule: "IDENTITY_NOT_VERIFIED",
        severity: "info",
        message: `${cg.givenName} has not completed identity verification (${cg.identity.status.replaceAll("_", " ")}).`,
        action: cg.identity.status === "failed" || cg.identity.status === "in_person_pending" ? "Offer in-person verification at the clinic with the enrollment coordinator." : "Send the verification link again by text; offer a phone walk-through.",
        owner: "clinic",
        key: "IDENTITY_NOT_VERIFIED",
      });
    } else if (cg.proxy.status !== "confirmed") {
      s.push({
        rule: "PROXY_NOT_CONFIRMED",
        severity: cg.proxy.status === "requested" ? "warning" : "info",
        message: `${cg.givenName} is verified but the clinic has not confirmed her as ${h.patient.givenName}'s representative.`,
        action: "Record the patient's consent (or POA) and confirm the proxy in the Console; until then she sees nothing from the record.",
        owner: "clinic",
        key: "PROXY_NOT_CONFIRMED",
      });
    }
  }

  // --- Medications ---
  const disc = reconcile(h, asOf).filter((d) => d.severity === "warning");
  if (disc.length > 0 && !reconciliationIsCurrent(h.medReconciliationCompletedOn, asOf, 30)) {
    s.push({
      rule: "MED_DISCREPANCY",
      severity: "warning",
      message: `${disc.length} medication discrepanc${disc.length === 1 ? "y" : "ies"} between the clinic list and Medicare pharmacy claims: ${disc.map((d) => d.name).join("; ")}.`,
      action: "Reconcile with the caregiver at the next contact and mark reconciliation complete.",
      owner: "clinic",
      key: `MED_DISCREPANCY:${disc.length}`,
    });
  }

  // --- Cadence and visits ---
  const cad = cadenceStatus(h.carePlan.tier, h.contacts, asOf, h.enrolledOn);
  if (cad.state === "overdue") {
    s.push({
      rule: "CADENCE_OVERDUE",
      severity: cad.daysOverdue > cad.cadenceDays ? "critical" : "warning",
      message: `Contact overdue by ${cad.daysOverdue} day${cad.daysOverdue === 1 ? "" : "s"} (plan calls for every ${cad.cadenceDays} days).`,
      action: "Schedule a call or video check-in this week and log it.",
      owner: "clinic",
      key: `CADENCE_OVERDUE:${cad.nextDueOn}`,
    });
  } else if (cad.state === "never_contacted" && h.status === "active") {
    s.push({ rule: "CADENCE_OVERDUE", severity: "warning", message: "No clinic contact logged since enrollment.", action: "Make the welcome call and log it.", owner: "clinic", key: "CADENCE_OVERDUE:first" });
  }

  const missed = h.appointments.filter((a) => a.forPerson === "patient" && a.status === "missed" && within(a.date, 30));
  if (missed.length > 0) {
    const m = latest(missed)!;
    s.push({
      rule: "MISSED_APPOINTMENT",
      severity: "warning",
      message: `Missed ${labelPurpose(m.purpose)} on ${m.date}.`,
      action: "Call to reschedule; ask whether transport was the barrier and arrange it.",
      owner: "clinic",
      key: `MISSED_APPOINTMENT:${m.id}`,
      evidenceDate: m.date,
    });
  }
  const upcomingNoRide = h.appointments.filter((a) => a.forPerson === "patient" && a.status === "scheduled" && a.transport.needed && !a.transport.arranged && daysBetween(asOf, a.date) >= 0 && daysBetween(asOf, a.date) <= 7);
  for (const a of upcomingNoRide) {
    s.push({
      rule: "TRANSPORT_UNARRANGED",
      severity: "warning",
      message: `${labelPurpose(a.purpose)} on ${a.date} needs a ride that is not yet arranged.`,
      action: "Book Medicaid non-emergency transport or the AAA ride service; confirm with the caregiver by text.",
      owner: "both",
      key: `TRANSPORT_UNARRANGED:${a.id}`,
      evidenceDate: a.date,
    });
  }

  const ed = h.edVisits.filter((v) => within(v.date, 30));
  if (ed.length > 0) {
    const v = latest(ed)!;
    s.push({
      rule: "ED_VISIT_FOLLOW_UP",
      severity: "warning",
      message: `Emergency visit ${v.date} (${v.reason}${v.admitted ? ", admitted" : ""}).`,
      action: "Transitional follow-up within 7 days: reconcile discharge medications and update the plan.",
      owner: "clinic",
      key: `ED_VISIT_FOLLOW_UP:${v.date}`,
      evidenceDate: v.date,
    });
  }

  if (h.status === "active") {
    if (!h.lastAnnualWellnessOn || daysBetween(h.lastAnnualWellnessOn, asOf) > 365) {
      s.push({
        rule: "AWV_OVERDUE",
        severity: "info",
        message: h.lastAnnualWellnessOn ? `Annual wellness visit last done ${h.lastAnnualWellnessOn}.` : "No annual wellness visit on record.",
        action: "Schedule the annual wellness visit; it is a pilot access measure.",
        owner: "clinic",
        key: "AWV_OVERDUE",
      });
    }
    if (!h.lastCognitiveAssessmentOn || daysBetween(h.lastCognitiveAssessmentOn, asOf) > 365) {
      s.push({
        rule: "COGNITIVE_ASSESSMENT_DUE",
        severity: "info",
        message: h.lastCognitiveAssessmentOn ? `Cognitive assessment and care-plan visit last done ${h.lastCognitiveAssessmentOn}.` : "No cognitive assessment and care-plan visit on record.",
        action: "Schedule the assessment visit with the caregiver present; it anchors the written plan.",
        owner: "clinic",
        key: "COGNITIVE_ASSESSMENT_DUE",
      });
    }
  }

  // --- Staging ---
  const st = determineStage(h.staging);
  if (st.conflict) {
    s.push({ rule: "STAGING_CONFLICT", severity: "warning", message: st.detail, action: "Clinician to re-stage at the next visit and record which instrument governs.", owner: "clinic", key: "STAGING_CONFLICT" });
  }
  if (isHospiceThreshold(h.staging?.fast)) {
    s.push({ rule: "HOSPICE_THRESHOLD", severity: "info", message: `FAST ${h.staging?.fast}: at or past the customary hospice-eligibility threshold.`, action: "Open a goals-of-care conversation with the family; discuss hospice and what the caregiver would want.", owner: "clinic", key: "HOSPICE_THRESHOLD" });
  }

  const order = { critical: 0, warning: 1, info: 2 };
  return s.sort((a, b) => order[a.severity] - order[b.severity]);
}

export function labelPurpose(p: string): string {
  return (
    {
      annual_wellness: "annual wellness visit",
      cognitive_assessment: "cognitive assessment and care-plan visit",
      follow_up: "follow-up visit",
      specialist: "specialist visit",
      lab: "lab visit",
      behavioral_health: "behavioral health visit",
      caregiver_own_visit: "caregiver's own visit",
    } as Record<string, string>
  )[p] ?? p;
}

export function nextContactDue(h: Household, asOf: string): string | undefined {
  const c = cadenceStatus(h.carePlan.tier, h.contacts, asOf, h.enrolledOn);
  return c.nextDueOn ?? (h.enrolledOn ? addDays(h.enrolledOn, 7) : undefined);
}

/** Snoozed escalations stay out of the queue until the date passes; the rule keeps running. */
export function isSnoozed(e: { snoozedUntil?: string; status: string }, asOf: string): boolean {
  return e.status !== "resolved" && !!e.snoozedUntil && e.snoozedUntil > asOf;
}
