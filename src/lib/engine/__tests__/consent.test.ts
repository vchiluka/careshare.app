import { describe, expect, it } from "vitest";
import { buildConsent, consentFor, consentState, hasActiveConsent, supersedeConsents } from "../consent";

const base = { id: "c1", caregiverId: "cg1", basis: "patient" as const, typedSignature: "Denise Hairston", signedAt: "2026-08-01T14:00:00Z", asOf: "2026-08-01", shareDirectory: true, shareEvaluator: false };

describe("consent (90-day authorization)", () => {
  it("expires 90 days after signing and carries the chosen sharing", () => {
    const c = buildConsent(base);
    expect(c.expiresOn).toBe("2026-10-30");
    expect(c.shareWith).toEqual({ clinic: true, directoryPartner: true, evaluator: false });
    expect(c.status).toBe("active");
  });
  it("reports none / active / expiring / expired / revoked", () => {
    const c = buildConsent(base);
    expect(consentState(undefined, "2026-08-02").state).toBe("none");
    expect(consentState(c, "2026-08-02")).toEqual({ state: "active", daysLeft: 89 });
    expect(consentState(c, "2026-10-20").state).toBe("expiring");
    expect(consentState(c, "2026-10-31").state).toBe("expired");
    expect(consentState({ ...c, status: "revoked" }, "2026-08-02").state).toBe("revoked");
  });
  it("uses the latest signature for a caregiver and supersedes the previous one", () => {
    const old = buildConsent(base);
    const renewed = buildConsent({ ...base, id: "c2", signedAt: "2026-10-20T09:00:00Z", asOf: "2026-10-20" });
    const consents = [...supersedeConsents([old], "cg1"), renewed];
    expect(consents[0].status).toBe("superseded");
    expect(consentFor({ consents }, "cg1")?.id).toBe("c2");
    expect(hasActiveConsent({ consents }, "cg1", "2026-11-15")).toBe(true);
    expect(hasActiveConsent({ consents }, "cg1", "2027-02-01")).toBe(false);
    expect(hasActiveConsent({ consents }, "cg2", "2026-11-15")).toBe(false);
  });
});

describe("patient co-signature", () => {
  it("is kept only when the basis is the patient's own consent", () => {
    const withSig = buildConsent({ ...base, patientSignature: "Mabel Hairston" });
    expect(withSig.patientSignature).toBe("Mabel Hairston");
    const poa = buildConsent({ ...base, basis: "poa_healthcare", patientSignature: "Mabel Hairston" });
    expect(poa.patientSignature).toBeUndefined();
  });
});
