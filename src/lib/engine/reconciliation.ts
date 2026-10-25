/**
 * Medication reconciliation between the clinic's list and Medicare Part D pharmacy fills.
 *
 * Why this exists: the family caregiver is usually the only person who sees every prescriber.
 * Medicare Part D claims (via Blue Button 2.0 ExplanationOfBenefit, pharmacy type) show what was
 * actually dispensed, by NDC. Comparing that against the clinic's active list surfaces three things
 * a rural clinic cannot otherwise see:
 *   1. Filled but not on the list  — another prescriber started something (or the list is stale).
 *   2. On the list but not filled  — possible non-adherence, cost barrier, or a stopped medication.
 *   3. Same drug from two sources  — fine, but confirms the list is current.
 *
 * Matching is by normalized generic name. NDC-level matching is a later refinement once a
 * terminology service is attached; names are enough to prompt a conversation, which is the goal.
 */

import type { Household, Medication } from "@/lib/domain/types";
import { daysBetween } from "./dates";

export type DiscrepancyKind = "FILLED_NOT_LISTED" | "LISTED_NOT_FILLED" | "UNVERIFIED_CAREGIVER_ENTRY";

export interface Discrepancy {
  kind: DiscrepancyKind;
  name: string;
  detail: string;
  action: string;
  medicationId?: string;
  severity: "warning" | "info";
}

export function normalizeName(n: string): string {
  return n.toLowerCase().replace(/\b(er|xr|sr|hcl|hydrochloride|tablet|tablets|capsule|capsules|oral)\b/g, "").replace(/[^a-z]/g, "").trim();
}

export function reconcile(h: Pick<Household, "medications" | "medicareFills" | "medicare">, asOf: string, staleFillDays = 100): Discrepancy[] {
  const out: Discrepancy[] = [];
  const active = h.medications.filter((m) => m.status === "active");
  const listedNames = new Set(active.map((m) => normalizeName(m.name)));

  // Latest fill per drug name
  const latestFill = new Map<string, { name: string; strength: string; fillOn: string; daysSupply: number }>();
  for (const f of h.medicareFills) {
    const k = normalizeName(f.name);
    const prev = latestFill.get(k);
    if (!prev || f.fillOn > prev.fillOn) latestFill.set(k, f);
  }

  if (h.medicare.connected) {
    for (const [k, f] of latestFill) {
      if (!listedNames.has(k) && daysBetween(f.fillOn, asOf) <= 180) {
        out.push({
          kind: "FILLED_NOT_LISTED",
          name: `${f.name} ${f.strength}`,
          detail: `Filled ${f.fillOn} (${f.daysSupply}-day supply) per Medicare Part D claims, but not on the clinic's active list.`,
          action: "Ask the caregiver who prescribed it and whether it is still being taken; add it to the list or record it as stopped.",
          severity: "warning",
        });
      }
    }
    for (const m of active) {
      const k = normalizeName(m.name);
      const f = latestFill.get(k);
      if (m.source !== "caregiver" && f && daysBetween(f.fillOn, asOf) > f.daysSupply + 30 && daysBetween(f.fillOn, asOf) > staleFillDays) {
        out.push({
          kind: "LISTED_NOT_FILLED",
          name: `${m.name} ${m.strength}`,
          detail: `Last pharmacy fill ${f.fillOn} (${f.daysSupply}-day supply); no fill since.`,
          action: "Check with the caregiver: stopped, cost, or missed refills? Update the list or arrange a refill.",
          medicationId: m.id,
          severity: "warning",
        });
      }
    }
  }

  for (const m of active) {
    if (m.status === "active" && m.source === "caregiver") {
      out.push({
        kind: "UNVERIFIED_CAREGIVER_ENTRY",
        name: `${m.name} ${m.strength}`,
        detail: "Entered by the caregiver; not yet confirmed by the clinic.",
        action: "Confirm at the next contact and move it to the clinic list, or mark it stopped.",
        medicationId: m.id,
        severity: "info",
      });
    }
  }
  return out;
}

export function reconciliationIsCurrent(completedOn: string | undefined, asOf: string, windowDays = 90): boolean {
  return !!completedOn && daysBetween(completedOn, asOf) <= windowDays;
}

export function sortMedications(meds: Medication[]): Medication[] {
  const order = { active: 0, unverified: 1, stopped: 2 };
  return [...meds].sort((a, b) => order[a.status] - order[b.status] || a.name.localeCompare(b.name));
}
