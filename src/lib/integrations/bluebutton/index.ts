import { randomToken } from "../crypto";
import { createLiveBlueButtonAdapter } from "./live";
import type { BlueButtonAdapter, BlueButtonCompleteResult, BlueButtonStartResult, MedicareFill } from "./types";

export type * from "./types";

/**
 * Mock Blue Button: /mock/bluebutton plays Medicare.gov and returns the household's seeded fills.
 * The seed already carries `medicareFills` per household; the mock "pull" just marks the
 * connection and returns them, so the reconciliation engine has something to work with.
 */
export function createMockBlueButtonAdapter(getSeedFills: (householdId: string) => Promise<MedicareFill[]>): BlueButtonAdapter {
  return {
    mode: "mock",
    async start({ householdId, returnUrl }): Promise<BlueButtonStartResult> {
      const state = randomToken(16);
      return { redirectUrl: `/mock/bluebutton?state=${state}`, session: { state, householdId, returnUrl, startedAt: new Date().toISOString() } };
    },
    async complete({ params, session }): Promise<BlueButtonCompleteResult> {
      if (params.state !== session.state) return { ok: false, failureReason: "State mismatch." };
      if (params.code === "deny") return { ok: false, failureReason: "Authorization was declined on Medicare.gov (simulated)." };
      return { ok: true, patientRef: `mock-${session.householdId}`, fills: await getSeedFills(session.householdId), coverage: undefined, pulledOn: new Date().toISOString().slice(0, 10) };
    },
  };
}

export function blueButtonMode(): "mock" | "live" {
  const v = process.env.BLUEBUTTON_ADAPTER ?? "mock";
  if (v !== "mock" && v !== "live") throw new Error(`BLUEBUTTON_ADAPTER must be mock or live, got "${v}".`);
  return v;
}

export function getBlueButtonAdapter(getSeedFills: (householdId: string) => Promise<MedicareFill[]>): BlueButtonAdapter {
  return blueButtonMode() === "live" ? createLiveBlueButtonAdapter() : createMockBlueButtonAdapter(getSeedFills);
}
