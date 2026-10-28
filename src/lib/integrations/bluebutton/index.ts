import type { CaregiverAccount, Household } from "@/lib/domain/types";
import { careTerm } from "@/lib/domain/care-terms";
import { randomToken } from "../crypto";
import { mapBlueButton } from "./fhir";
import { createLiveBlueButtonAdapter } from "./live";
import { syntheticBlueButton, type SyntheticProfile } from "./synthetic";
import type { BlueButtonAdapter, BlueButtonCompleteResult, BlueButtonStartResult } from "./types";

export type * from "./types";
export { coverageSummary, diagnosesFromImport, fillsFromImport, mapBlueButton } from "./fhir";
export { syntheticBlueButton } from "./synthetic";

/** The synthetic profile the mock uses for a household: built from what the app already knows. */
export function syntheticProfileFor(h: Household, asOf: string): SyntheticProfile {
  const drugs = h.medications.filter((m) => m.status === "active" && m.source !== "caregiver" && m.ndc).map((m) => ({ ndc: m.ndc!, name: m.name, strength: m.strength }));
  const fallback = drugs.length
    ? drugs
    : [
        { ndc: "00093741501", name: "donepezil", strength: "10 mg" },
        { ndc: "68180051301", name: "lisinopril", strength: "20 mg" },
        { ndc: "00378395277", name: "atorvastatin", strength: "20 mg" },
      ];
  const dementia = h.patient.diagnoses.find((d) => /^(G30|F01|F02|F03|G31\.83)/.test(d.code))?.code ?? "F03.90";
  return {
    key: h.id,
    givenName: h.patient.givenName,
    familyName: h.patient.familyName,
    birthDate: h.patient.birthDate,
    gender: h.patient.sex === "F" ? "female" : "male",
    state: "51",
    postalCode: h.patient.localityFips === "51590" ? "245" : "245",
    dual: h.patient.coverage.medicaid,
    dementiaCode: dementia,
    comorbidities: h.patient.diagnoses.map((d) => d.code).filter((c) => c !== dementia).slice(0, 3).concat(["I10", "E78.5"]).slice(0, 3),
    drugs: fallback,
    asOf,
    edVisitDaysAgo: h.edVisits[0] ? Math.max(1, Math.round((Date.parse(asOf) - Date.parse(h.edVisits[0].date)) / 86400000)) : undefined,
  };
}

/**
 * The synthetic profile the mock uses while a caregiver is adding a patient and no household exists yet:
 * built from the draft (first name, relationship, county). Deterministic by account id.
 */
export function syntheticProfileForAccount(a: CaregiverAccount, asOf: string): SyntheticProfile {
  const d = a.pending ?? { startedAt: asOf };
  const t = careTerm(d.term);
  const seed = [...a.id].reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) >>> 0, 7);
  const age = 76 + (seed % 13);
  const birthYear = +asOf.slice(0, 4) - age;
  const sameSurname = t.relationship === "child" || t.relationship === "spouse" || t.relationship === "sibling";
  const surnames = ["Hodnett", "Pruett", "Dalton", "Shelton", "Yeatts", "Stowe", "Crews", "Boswell"];
  return {
    key: a.id,
    givenName: d.patientFirstName || (t.sex === "M" ? "Earl" : "Mabel"),
    familyName: sameSurname && a.familyName ? a.familyName : surnames[seed % surnames.length],
    birthDate: `${birthYear}-${String(1 + (seed % 12)).padStart(2, "0")}-${String(1 + (seed % 27)).padStart(2, "0")}`,
    gender: t.sex === "M" ? "male" : "female",
    state: "51",
    postalCode: "245",
    dual: seed % 3 === 0,
    dementiaCode: seed % 2 ? "G30.9" : "F03.90",
    comorbidities: ["I10", seed % 2 ? "E11.9" : "E78.5"],
    drugs: [
      { ndc: "00093741501", name: "donepezil", strength: "10 mg" },
      { ndc: "68180051301", name: "lisinopril", strength: "20 mg" },
      { ndc: "00378395277", name: "atorvastatin", strength: "20 mg" },
      ...(seed % 2 ? [{ ndc: "00093104801", name: "metformin", strength: "500 mg" }] : []),
    ],
    asOf,
    edVisitDaysAgo: seed % 4 === 0 ? 20 + (seed % 40) : undefined,
  };
}

export interface MockResolvers {
  household: (id: string) => Promise<Household | undefined>;
  account: (id: string) => Promise<CaregiverAccount | undefined>;
  asOf: () => Promise<string>;
}

/**
 * Mock Blue Button: /mock/bluebutton plays Medicare.gov; completing it builds a synthetic bundle in
 * the sandbox's FHIR shapes for the subject and runs it through the same mapper as live.
 */
export function createMockBlueButtonAdapter(r: MockResolvers): BlueButtonAdapter {
  return {
    mode: "mock",
    async start({ subject, returnUrl }): Promise<BlueButtonStartResult> {
      const state = randomToken(16);
      return { redirectUrl: `/mock/bluebutton?state=${state}`, session: { state, subject, returnUrl, startedAt: new Date().toISOString() } };
    },
    async complete({ params, session }): Promise<BlueButtonCompleteResult> {
      if (params.state !== session.state) return { ok: false, failureReason: "State mismatch." };
      if (params.code === "deny") return { ok: false, failureReason: "Authorization was declined on Medicare.gov (simulated)." };
      const day = await r.asOf();
      let profile: SyntheticProfile | undefined;
      if (session.subject.kind === "household") {
        const h = await r.household(session.subject.householdId);
        profile = h && syntheticProfileFor(h, day);
      } else {
        const a = await r.account(session.subject.accountId);
        profile = a && syntheticProfileForAccount(a, day);
      }
      if (!profile) return { ok: false, failureReason: "Record not found." };
      const bundle = syntheticBlueButton(profile);
      // Medicare.gov lets the beneficiary withhold demographics: claims and coverage still arrive, Patient does not.
      const noDemo = params.code === "ok_nodemo";
      return { ok: true, patientRef: bundle.patient.id as string, import: mapBlueButton({ ...bundle, patient: noDemo ? undefined : bundle.patient, pulledOn: day, source: "mock", baseUrl: "mock://bluebutton" }) };
    },
  };
}

export function blueButtonMode(): "mock" | "live" {
  const v = process.env.BLUEBUTTON_ADAPTER ?? "mock";
  if (v !== "mock" && v !== "live") throw new Error(`BLUEBUTTON_ADAPTER must be mock or live, got "${v}".`);
  return v;
}

/** Never throws: reports mode and any missing configuration so pages can render a notice instead of crashing. */
export function describeBlueButton(): { mode: "mock" | "live"; configError?: string } {
  try {
    const mode = blueButtonMode();
    if (mode === "live") createLiveBlueButtonAdapter();
    return { mode };
  } catch (e) {
    return { mode: "live", configError: (e as Error).message };
  }
}

export function getBlueButtonAdapter(r: MockResolvers): BlueButtonAdapter {
  return blueButtonMode() === "live" ? createLiveBlueButtonAdapter() : createMockBlueButtonAdapter(r);
}
