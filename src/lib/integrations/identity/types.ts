/**
 * Identity proofing for caregiver delegated access.
 *
 * Target: NIST SP 800-63-3 IAL2 identity assurance and AAL2 authenticator assurance, the bar
 * Medicare.gov adopted for beneficiary sign-in (CLEAR, ID.me, Login.gov) and the bar the CMS
 * Health Technology Ecosystem sets for third-party access to beneficiary data.
 *
 * Providers:
 *   mock   — a local page at /mock/identity that lets the demo driver choose the outcome.
 *   idme   — OpenID Connect, authorization code + PKCE, against the ID.me sandbox or production.
 *   clear  — CLEAR Verified, OpenID Connect, same shape.
 * Both live providers share one OIDC implementation (oidc.ts) configured from environment
 * variables; nothing vendor-specific is hard-coded beyond defaults that can be overridden.
 *
 * The app only ever calls this interface. The server action persists `session` in a signed,
 * HTTP-only cookie between start() and complete(); the provider never sees the cookie.
 */

export type IdentityProviderId = "idme" | "clear";

export interface StartProofingInput {
  /** Who is being proofed. Exactly one of these is set. */
  subject: { kind: "caregiver"; caregiverId: string; householdId: string } | { kind: "account"; accountId: string } | { kind: "staff"; email?: string; name?: string };
  /** Where to send the person after the callback has been processed. */
  returnUrl: string;
}

export interface StartProofingResult {
  /** Send the browser here. */
  redirectUrl: string;
  /** Opaque state echoed back by the provider. */
  state: string;
  /** Server-side session to bind the callback to the caregiver (state, nonce, PKCE verifier, ids). */
  session: ProofingSession;
}

export interface ProofingSession {
  provider: IdentityProviderId;
  state: string;
  nonce?: string;
  codeVerifier?: string;
  subject: StartProofingInput["subject"];
  returnUrl: string;
  startedAt: string;
}

export interface CompleteProofingInput {
  /** Query parameters from the callback. */
  params: Record<string, string | undefined>;
  session: ProofingSession;
}

export interface VerifiedIdentity {
  provider: IdentityProviderId | "in_person";
  /** Provider's stable subject identifier. The only identity value persisted. */
  subject: string;
  assuranceLevel: "IAL1" | "IAL2";
  authenticatorLevel: "AAL1" | "AAL2";
  verifiedOn: string;
  /** Released attributes, used once to confirm the right person is enrolling. Not persisted. */
  attributes: { givenName?: string; familyName?: string; birthDate?: string };
  /** Raw assurance evidence (acr/ial/aal claim values) for the audit trail. No PII. */
  evidence: string;
}

export interface CompleteProofingResult {
  ok: boolean;
  identity?: VerifiedIdentity;
  failureReason?: string;
}

export interface IdentityProvider {
  readonly id: IdentityProviderId;
  readonly displayName: string;
  readonly mode: "mock" | "live";
  start(input: StartProofingInput): Promise<StartProofingResult>;
  complete(input: CompleteProofingInput): Promise<CompleteProofingResult>;
}
