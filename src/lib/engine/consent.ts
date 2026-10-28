/**
 * Authorization to access and share health information.
 *
 * The caregiver signs once after identity proofing, choosing the basis (the patient consented and has
 * capacity; a health care power of attorney is on file; a court-appointed guardian). It expires after
 * 90 days and the app re-prompts; a lapsed consent closes the record to the caregiver until she
 * re-affirms, while her own check-ins stay available. Revocation is immediate.
 *
 * This is the app-level authorization. It does not replace the clinic's own HIPAA authorization or
 * the patient's designation of a personal representative under 45 CFR 164.502(g); the form text says
 * so, and the clinic's proxy confirmation records which document it relied on.
 */

import { CONSENT_FORM_VERSION, CONSENT_VALID_DAYS, type ConsentBasis, type ConsentRecord, type Household, type ProxyScope } from "@/lib/domain/types";
import { addDays, daysBetween } from "./dates";

export const ALL_SCOPES: ProxyScope[] = ["care_plan", "medications", "appointments", "messages", "medicare_records", "symptom_log"];

export type ConsentState = "none" | "active" | "expiring" | "expired" | "revoked";

export function consentFor(h: Pick<Household, "consents">, caregiverId: string): ConsentRecord | undefined {
  return [...(h.consents ?? [])].filter((c) => c.caregiverId === caregiverId).sort((a, b) => a.signedAt.localeCompare(b.signedAt)).at(-1);
}

export function consentState(c: ConsentRecord | undefined, asOf: string): { state: ConsentState; daysLeft?: number } {
  if (!c) return { state: "none" };
  if (c.status === "revoked") return { state: "revoked" };
  const daysLeft = daysBetween(asOf, c.expiresOn);
  if (daysLeft < 0 || c.status === "expired") return { state: "expired", daysLeft };
  if (daysLeft <= 14) return { state: "expiring", daysLeft };
  return { state: "active", daysLeft };
}

export function hasActiveConsent(h: Pick<Household, "consents">, caregiverId: string, asOf: string): boolean {
  const s = consentState(consentFor(h, caregiverId), asOf).state;
  return s === "active" || s === "expiring";
}

export function buildConsent(input: { id: string; caregiverId: string; basis: ConsentBasis; typedSignature: string; signedAt: string; asOf: string; shareDirectory: boolean; shareEvaluator: boolean; attestedFrom?: string; patientSignature?: string }): ConsentRecord {
  return {
    id: input.id,
    caregiverId: input.caregiverId,
    version: CONSENT_FORM_VERSION,
    basis: input.basis,
    typedSignature: input.typedSignature.trim().slice(0, 120),
    signedAt: input.signedAt,
    expiresOn: addDays(input.asOf, CONSENT_VALID_DAYS),
    scopes: ALL_SCOPES,
    shareWith: { clinic: true, directoryPartner: input.shareDirectory, evaluator: input.shareEvaluator },
    status: "active",
    attestedFrom: input.attestedFrom,
    patientSignature: input.basis === "patient" && input.patientSignature?.trim() ? input.patientSignature.trim().slice(0, 120) : undefined,
  };
}

/** Marks the previous active consent superseded when a new one is signed. */
export function supersedeConsents(consents: ConsentRecord[], caregiverId: string): ConsentRecord[] {
  return consents.map((c) => (c.caregiverId === caregiverId && c.status === "active" ? { ...c, status: "superseded" } : c));
}

export const CONSENT_TEXT = {
  title: "Authorization to access and share health information",
  intro:
    "I am a family member or trusted person who helps care for the person named below. By signing, I am asking CareShare and the partner clinic to let me see and help manage this person's care information, and I am telling them on what basis I am allowed to do that.",
  sections: [
    {
      heading: "What I will be able to see and do",
      body: "The shared care plan; the medication list, including prescriptions filled under Medicare if I connect those records; appointments and transportation; messages with the clinic; the symptom log I keep; and the clinic's monthly summary. I can add information, and the clinic can see what I add.",
    },
    {
      heading: "Who it is shared with",
      body: "The partner primary care clinic and its care team, always. Optionally, a de-identified outcome (for example, \"a family in this county used this respite program\") with the community resource directory, and de-identified program measures with the pilot's independent evaluator. I choose those two below.",
    },
    {
      heading: "How long it lasts",
      body: "Ninety days. The app will ask me to re-affirm before it lapses. If it lapses, I keep access to my own check-ins but not to the care record until I sign again. I can revoke it at any time from my account, and the clinic will be told.",
    },
    {
      heading: "What this is not",
      body: "This is not a power of attorney and does not make me the patient's legal representative. The clinic will separately confirm my status, using the patient's own consent or the legal document I name below, before it relies on this authorization.",
    },
  ],
  attestation: "I confirm that what I have entered is true, that I will use this information only to help care for the person named, and that I will tell the clinic if my role changes.",
} as const;
