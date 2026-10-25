/**
 * CMS Blue Button 2.0: the beneficiary's (or their verified representative's) Medicare claims.
 *
 * CareShare uses it for two things a rural clinic cannot otherwise see:
 *   - Part D pharmacy fills (ExplanationOfBenefit, type PDE) for medication reconciliation
 *   - Coverage (Parts A/B/C/D, Medicaid dual status indicators) for the plan's eligibility context
 *
 * OAuth 2.0 authorization code with PKCE; the person consents on Medicare.gov. Sandbox at
 * sandbox.bluebutton.cms.gov with synthetic beneficiaries; production requires CMS approval.
 */

export interface MedicareFill {
  ndc: string;
  name: string;
  strength: string;
  fillOn: string;
  daysSupply: number;
}

export interface MedicareCoverage {
  partA: boolean;
  partB: boolean;
  partC: boolean;
  partD: boolean;
  dualEligible?: boolean;
}

export interface BlueButtonSession {
  state: string;
  codeVerifier?: string;
  householdId: string;
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
  patientRef?: string; // Blue Button FHIR Patient id, not the MBI
  fills?: MedicareFill[];
  coverage?: MedicareCoverage;
  pulledOn?: string;
}

export interface BlueButtonAdapter {
  readonly mode: "mock" | "live";
  start(input: { householdId: string; returnUrl: string }): Promise<BlueButtonStartResult>;
  complete(input: { params: Record<string, string | undefined>; session: BlueButtonSession }): Promise<BlueButtonCompleteResult>;
}
