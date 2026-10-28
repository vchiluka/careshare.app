import { describe, expect, it } from "vitest";
import { exportHouseholdBundle } from "@/lib/integrations/fhir/export";
import { findShare, newShareLink, shlinkUri } from "@/lib/services/share";
import { isSnoozed } from "../signals";
import { loadSeed } from "@/lib/store/memory";

const seed = loadSeed();
const hh = seed.households.find((h) => h.id === "hh_hairston")!;

describe("share with a provider", () => {
  it("stores only hashes, resolves with the right PIN, and rejects wrong PIN, expiry and revocation", async () => {
    const now = new Date("2026-10-24T12:00:00Z");
    const { link, secret, pin } = await newShareLink({ id: "shr1", caregiverId: hh.caregivers[0].id, label: "Emergency department", now });
    expect(link.tokenHash).not.toContain(secret);
    expect(link.pinHash).not.toContain(pin);
    const h = { ...hh, shares: [link] };
    expect((await findShare([h], secret, pin, now)).ok).toBe(true);
    expect((await findShare([h], secret, "000000", now))).toEqual({ ok: false, reason: "bad_pin" });
    expect((await findShare([h], "nope", pin, now))).toEqual({ ok: false, reason: "not_found" });
    expect((await findShare([h], secret, pin, new Date("2026-10-28T12:00:00Z")))).toEqual({ ok: false, reason: "expired" });
    expect((await findShare([{ ...h, shares: [{ ...link, revokedAt: now.toISOString() }] }], secret, pin, now))).toEqual({ ok: false, reason: "revoked" });
  });
  it("encodes a SMART Health Link payload with the P flag and expiry", () => {
    const uri = shlinkUri("https://example.org/share/abc", "ED", "2026-10-27T12:00:00Z");
    expect(uri.startsWith("shlink:/")).toBe(true);
    const payload = JSON.parse(Buffer.from(uri.slice("shlink:/".length), "base64url").toString());
    expect(payload).toMatchObject({ url: "https://example.org/share/abc", flag: "P", label: "ED" });
    expect(payload.exp).toBe(Math.floor(Date.parse("2026-10-27T12:00:00Z") / 1000));
  });
});

describe("FHIR R4 export", () => {
  it("produces a collection bundle with the expected resource types and no MBI", () => {
    const b = exportHouseholdBundle(hh, { asOf: "2026-10-24", caregiverId: hh.caregivers[0].id }) as { resourceType: string; entry: { resource: Record<string, unknown> }[] };
    expect(b.resourceType).toBe("Bundle");
    const types = new Set(b.entry.map((e) => e.resource.resourceType as string));
    for (const t of ["Patient", "RelatedPerson", "Consent", "Condition", "MedicationStatement", "CarePlan"]) expect(types.has(t)).toBe(true);
    expect(JSON.stringify(b)).not.toContain("SYNTHETIC");
    expect(JSON.stringify(b)).not.toContain(hh.patient.mbi);
  });
});

describe("snooze", () => {
  it("hides until the date, then returns", () => {
    expect(isSnoozed({ status: "open", snoozedUntil: "2026-10-30" }, "2026-10-24")).toBe(true);
    expect(isSnoozed({ status: "open", snoozedUntil: "2026-10-30" }, "2026-10-30")).toBe(false);
    expect(isSnoozed({ status: "resolved", snoozedUntil: "2026-10-30" }, "2026-10-24")).toBe(false);
  });
});
