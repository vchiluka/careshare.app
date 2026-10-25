/**
 * Care-plan tiering: stage, then caregiver, then burden.
 *
 * Adapted from the dementia care-management structure CMS published for its GUIDE model
 * (CMS GUIDE FAQ, "How does CMS assign beneficiaries to Model Tiers?"), which splits households by
 * dementia stage (mild vs moderate/severe), presence of an unpaid caregiver, and caregiver burden.
 * CareShare uses the structure because it is a validated way to decide how often a clinic should
 * be in touch and what the caregiver needs. Nothing here enrolls anyone in a CMS model or bills
 * anything; the tier only sets cadence and the caregiver-support emphasis of the plan.
 *
 * Instruments:
 *   Stage:  CDR global (clinician-rated) and FAST. CDR 1 / FAST 4 = mild; CDR 2-3 / FAST 5-7 = moderate/severe.
 *           CDR 0 or 0.5 and FAST 1-3 do not stage a dementia.
 *   Burden: Zarit Burden Interview, 12-item short form (Bédard et al. 2001), 0-48.
 *           CareShare uses the short form because caregivers complete it on a phone in under
 *           three minutes; the published high-burden cutoff for the 12-item form is 17.
 *           (The 22-item form's cutoff of 61/88 is the CMS tier convention; we document the
 *           adaptation rather than pretend the instruments are the same.)
 */

import type { CareTier, CdrGlobal, FastStage, Staging } from "@/lib/domain/types";

export const ZBI12_HIGH_CUTOFF = 17;
export const ZBI12_MAX = 48;
export const PHQ2_POSITIVE = 3;

export type DementiaStage = "mild" | "moderate_severe";

export interface StagingResult {
  stage: DementiaStage | null;
  source: "cdr" | "fast" | "both" | "none";
  conflict: boolean;
  detail: string;
}

export function stageFromCdr(cdr: CdrGlobal): DementiaStage | null {
  if (cdr === 1) return "mild";
  if (cdr === 2 || cdr === 3) return "moderate_severe";
  return null;
}

export function fastInteger(fast: FastStage): number {
  return parseInt(fast, 10);
}

export function stageFromFast(fast: FastStage): DementiaStage | null {
  const n = fastInteger(fast);
  if (n === 4) return "mild";
  if (n >= 5) return "moderate_severe";
  return null;
}

/** When CDR and FAST disagree, CDR governs (clinician-rated) and the conflict is surfaced for review. */
export function determineStage(s?: Pick<Staging, "cdrGlobal" | "fast">): StagingResult {
  if (!s) return { stage: null, source: "none", conflict: false, detail: "No staging recorded." };
  const byCdr = s.cdrGlobal !== undefined ? stageFromCdr(s.cdrGlobal) : undefined;
  const byFast = s.fast !== undefined ? stageFromFast(s.fast) : undefined;
  if (byCdr !== undefined && byFast !== undefined) {
    if (byCdr === byFast) return { stage: byCdr, source: "both", conflict: false, detail: `CDR ${s.cdrGlobal} and FAST ${s.fast} agree.` };
    return {
      stage: byCdr,
      source: "both",
      conflict: true,
      detail: `CDR ${s.cdrGlobal} (${byCdr ?? "not staged"}) and FAST ${s.fast} (${byFast ?? "not staged"}) disagree; CDR governs pending clinician review.`,
    };
  }
  if (byCdr !== undefined) return { stage: byCdr, source: "cdr", conflict: false, detail: `CDR ${s.cdrGlobal} only.` };
  if (byFast !== undefined) return { stage: byFast, source: "fast", conflict: false, detail: `FAST ${s.fast} only.` };
  return { stage: null, source: "none", conflict: false, detail: "No staging instrument recorded." };
}

export function zbi12Total(items: number[]): number {
  if (items.length !== 12) throw new Error(`ZBI-12 requires 12 items, got ${items.length}`);
  for (const v of items) if (!Number.isInteger(v) || v < 0 || v > 4) throw new Error(`ZBI item out of range: ${v}`);
  return items.reduce((s, v) => s + v, 0);
}

export function zbi12Band(total: number): "low" | "moderate" | "high" {
  if (total < 0 || total > ZBI12_MAX) throw new Error(`ZBI-12 total out of range: ${total}`);
  if (total < 10) return "low";
  if (total < ZBI12_HIGH_CUTOFF) return "moderate";
  return "high";
}

export function phq2Total(items: [number, number]): number {
  for (const v of items) if (!Number.isInteger(v) || v < 0 || v > 3) throw new Error(`PHQ-2 item out of range: ${v}`);
  return items[0] + items[1];
}

export interface TierResult {
  tier: CareTier | null;
  stage: DementiaStage | null;
  staging: StagingResult;
  hasCaregiver: boolean;
  zbiTotal?: number;
  burdenHigh?: boolean;
  evidence: string[];
  blockers: string[];
}

export function determineTier(staging: Staging | undefined, hasPrimaryCaregiver: boolean, latestZbi12?: number): TierResult {
  const st = determineStage(staging);
  const evidence: string[] = [st.detail];
  const blockers: string[] = [];

  if (!st.stage) {
    blockers.push(st.source === "none" ? "Record a CDR global or FAST stage at the next visit." : "Scores do not stage a dementia (CDR 0/0.5 or FAST 1-3). Confirm the diagnosis before setting a tier.");
  }

  let burdenHigh: boolean | undefined;
  if (hasPrimaryCaregiver) {
    if (latestZbi12 !== undefined) {
      burdenHigh = latestZbi12 >= ZBI12_HIGH_CUTOFF;
      evidence.push(`Caregiver burden ZBI-12 ${latestZbi12}/48 (${zbi12Band(latestZbi12)}).`);
    } else if (st.stage === "moderate_severe") {
      blockers.push("Caregiver present with moderate/severe dementia: a ZBI-12 check-in is needed to set the tier.");
    } else {
      evidence.push("Mild stage: burden check-in not required for the tier but is part of the baseline.");
    }
  } else {
    evidence.push("No unpaid caregiver in the household; individual plan.");
  }

  let tier: CareTier | null = null;
  if (st.stage === "mild") tier = hasPrimaryCaregiver ? "LOW_DYAD" : "LOW_INDIVIDUAL";
  else if (st.stage === "moderate_severe") {
    if (!hasPrimaryCaregiver) tier = "MOD_HIGH_INDIVIDUAL";
    else if (burdenHigh === true) tier = "HIGH_DYAD";
    else if (burdenHigh === false) tier = "MODERATE_DYAD";
  }
  if (tier) evidence.push(`Tier: ${TIER_LABELS[tier]}.`);

  return { tier, stage: st.stage, staging: st, hasCaregiver: hasPrimaryCaregiver, zbiTotal: latestZbi12, burdenHigh, evidence, blockers };
}

export const TIER_LABELS: Record<CareTier, string> = {
  LOW_DYAD: "Mild stage, caregiver at home",
  MODERATE_DYAD: "Moderate/severe stage, caregiver coping",
  HIGH_DYAD: "Moderate/severe stage, caregiver under high strain",
  LOW_INDIVIDUAL: "Mild stage, lives alone",
  MOD_HIGH_INDIVIDUAL: "Moderate/severe stage, lives alone",
};

export const TIER_SHORT: Record<CareTier, string> = {
  LOW_DYAD: "Low",
  MODERATE_DYAD: "Moderate",
  HIGH_DYAD: "High",
  LOW_INDIVIDUAL: "Low, alone",
  MOD_HIGH_INDIVIDUAL: "Mod/high, alone",
};

/** FAST 7a and beyond is the customary hospice-eligibility threshold for dementia. */
export function isHospiceThreshold(fast?: FastStage): boolean {
  return fast !== undefined && fastInteger(fast) >= 7;
}
