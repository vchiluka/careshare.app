/**
 * CMS Blue Button 2.0: the beneficiary's (or their verified representative's) Medicare data.
 *
 * What CareShare pulls, in Blue Button's FHIR R4 shapes (CARIN Blue Button profiles):
 *   - Patient            demographics (no MBI stored)
 *   - Coverage           Parts A/B/C/D with CMS extensions (dual eligibility, Part D plan, LIS)
 *   - ExplanationOfBenefit  all types: PDE (Part D fills), carrier/DME (Part B), inpatient,
 *                        outpatient, SNF, HHA, hospice
 * The mapper in fhir.ts reduces them to MedicareImport; reconciliation and the clinic panels read that.
 *
 * OAuth 2.0 authorization code with PKCE; the person consents on Medicare.gov. Sandbox at
 * sandbox.bluebutton.cms.gov with synthetic beneficiaries; production requires CMS approval.
 */

import type { MedicareImport } from "@/lib/domain/types";

/** Who the pull is for: an existing household, or a caregiver account adding a patient (household not yet created). */
export type BlueButtonSubject = { kind: "household"; householdId: string } | { kind: "account"; accountId: string };

export interface BlueButtonSession {
  state: string;
  codeVerifier?: string;
  subject: BlueButtonSubject;
  returnUrl: string;
  startedAt: string;
}

export interface BlueButtonStartResult {
  redirectUrl: string;
  session: BlueButtonSession;
}

export interface BlueButtonCompleteResult {
  ok: boolean;
  failureReason?: string;
  patientRef?: string;
  import?: MedicareImport;
}

export interface BlueButtonAdapter {
  readonly mode: "mock" | "live";
  start(input: { subject: BlueButtonSubject; returnUrl: string }): Promise<BlueButtonStartResult>;
  complete(input: { params: Record<string, string | undefined>; session: BlueButtonSession }): Promise<BlueButtonCompleteResult>;
}
