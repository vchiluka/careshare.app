import type { Household, MedicareImport } from "@/lib/domain/types";
import { coverageSummary, diagnosesFromImport, fillsFromImport } from "@/lib/integrations/bluebutton";

/**
 * Fold a Blue Button import into the household record.
 *
 * - Always: store the import, refresh the Part D fill list reconciliation uses, update coverage flags.
 * - When the household has no clinic-entered content yet (self-registered): seed the diagnosis list
 *   from claims and the medication list from recent Part D fills, marked source "medicare" so the
 *   clinic knows where they came from and can confirm or stop them.
 */
export function applyMedicareImport(h: Household, imp: MedicareImport, opts: { asOf: string; mode: "mock" | "live"; patientRef?: string }) {
  h.medicareImport = imp;
  h.medicareFills = fillsFromImport(imp);
  h.medicare = { connected: true, connectedOn: h.medicare.connectedOn ?? opts.asOf, lastSyncOn: opts.asOf, mode: opts.mode, authorizedBy: "representative", patientRef: opts.patientRef ?? imp.patient?.id };

  const cov = coverageSummary(imp);
  if (imp.coverages.length) h.patient.coverage = { ...h.patient.coverage, partA: cov.partA, partB: cov.partB, partC: cov.partC, partD: cov.partD, medicaid: cov.dual || h.patient.coverage.medicaid };

  if (h.patient.diagnoses.length <= 1) {
    const fromClaims = diagnosesFromImport(imp).slice(0, 8);
    const have = new Set(h.patient.diagnoses.map((d) => d.code));
    for (const d of fromClaims) if (!have.has(d.code)) h.patient.diagnoses.push({ code: d.code, display: d.display ?? `${d.code} (from Medicare claims; description pending)` });
  }

  if (h.medications.filter((m) => m.source !== "caregiver").length === 0) {
    const latest = new Map<string, (typeof h.medicareFills)[number]>();
    for (const f of h.medicareFills) {
      const prev = latest.get(f.name);
      if (!prev || f.fillOn > prev.fillOn) latest.set(f.name, f);
    }
    let n = 0;
    for (const f of latest.values()) {
      if (daysBetween(f.fillOn, opts.asOf) > 120) continue;
      h.medications.push({ id: `med_bb_${++n}_${Date.now().toString(36)}`, name: f.name, strength: f.strength, sig: "as directed (confirm with clinic)", source: "medicare", status: "unverified", lastFillOn: f.fillOn, daysSupply: f.daysSupply, ndc: f.ndc });
    }
  }
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
}
