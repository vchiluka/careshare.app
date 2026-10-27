import type { CompleteProofingInput, CompleteProofingResult, IdentityProvider, IdentityProviderId, StartProofingInput, StartProofingResult } from "./types";
import { randomToken } from "../crypto";

/**
 * Mock identity provider. Simulates the vendor hand-off: the browser goes to /mock/identity,
 * which plays the vendor and redirects back to the same callback route the live providers use.
 * Outcome is chosen on the mock page (verified / failed document check / abandoned).
 */
export function createMockIdentityProvider(brand: IdentityProviderId): IdentityProvider {
  return {
    id: brand,
    displayName: brand === "idme" ? "ID.me" : "CLEAR",
    mode: "mock",
    async start(input: StartProofingInput): Promise<StartProofingResult> {
      const state = randomToken(16);
      return {
        redirectUrl: `/mock/identity?state=${state}&brand=${brand}`,
        state,
        session: { provider: brand, state, subject: input.subject, returnUrl: input.returnUrl, startedAt: new Date().toISOString() },
      };
    },
    async complete({ params, session }: CompleteProofingInput): Promise<CompleteProofingResult> {
      if (params.state !== session.state) return { ok: false, failureReason: "State mismatch; start verification again." };
      if (params.code === "fail") return { ok: false, failureReason: "Document check did not pass at the vendor (simulated). Offer in-person verification at the clinic." };
      if (params.code === "cancel") return { ok: false, failureReason: "Verification was abandoned (simulated)." };
      return {
        ok: true,
        identity: {
          provider: brand,
          subject: `${brand}|mock|${session.subject.kind === "caregiver" ? session.subject.caregiverId : session.subject.kind === "account" ? session.subject.accountId : `staff-${session.state.slice(0, 6)}`}`,
          assuranceLevel: "IAL2",
          authenticatorLevel: "AAL2",
          verifiedOn: new Date().toISOString().slice(0, 10),
          attributes: session.subject.kind === "account" ? {} : { givenName: "Mock", familyName: "Verified" },
          evidence: "mock: simulated IAL2/AAL2 success",
        },
      };
    },
  };
}
