import type { Household } from "@/lib/domain/types";
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
 * Mock Blue Button: /mock/bluebutton plays Medicare.gov; completing it builds a synthetic bundle in
 * the sandbox's FHIR shapes for this household and runs it through the same mapper as live.
 */
export function createMockBlueButtonAdapter(getHousehold: (id: string) => Promise<Household | undefined>, asOf: () => Promise<string>): BlueButtonAdapter {
  return {
    mode: "mock",
    async start({ householdId, returnUrl }): Promise<BlueButtonStartResult> {
      const state = randomToken(16);
      return { redirectUrl: `/mock/bluebutton?state=${state}`, session: { state, householdId, returnUrl, startedAt: new Date().toISOString() } };
    },
    async complete({ params, session }): Promise<BlueButtonCompleteResult> {
      if (params.state !== session.state) return { ok: false, failureReason: "State mismatch." };
      if (params.code === "deny") return { ok: false, failureReason: "Authorization was declined on Medicare.gov (simulated)." };
      const h = await getHousehold(session.householdId);
      if (!h) return { ok: false, failureReason: "Household not found." };
      const day = await asOf();
      const bundle = syntheticBlueButton(syntheticProfileFor(h, day));
      return { ok: true, patientRef: bundle.patient.id as string, import: mapBlueButton({ ...bundle, pulledOn: day, source: "mock", baseUrl: "mock://bluebutton" }) };
    },
  };
}

export function blueButtonMode(): "mock" | "live" {
  const v = process.env.BLUEBUTTON_ADAPTER ?? "mock";
  if (v !== "mock" && v !== "live") throw new Error(`BLUEBUTTON_ADAPTER must be mock or live, got "${v}".`);
  return v;
}

export function getBlueButtonAdapter(getHousehold: (id: string) => Promise<Household | undefined>, asOf: () => Promise<string>): BlueButtonAdapter {
  return blueButtonMode() === "live" ? createLiveBlueButtonAdapter() : createMockBlueButtonAdapter(getHousehold, asOf);
}
