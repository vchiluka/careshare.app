/**
 * Demo sessions. Signed, HTTP-only cookies carry who is acting; the record itself is gated
 * on the caregiver's identity and proxy status, never on the cookie alone.
 *
 * In production the caregiver session is established by the identity provider's AAL2 login
 * (the same CLEAR/ID.me account used for proofing), and the staff session by the clinic's SSO.
 * The demo "sign in as" pages stand in for both.
 */

import { cookies } from "next/headers";
import { signPayload, verifyPayload } from "./integrations/crypto";

export interface CaregiverSession {
  /** Self-registered caregivers carry an account; clinic-enrolled demo caregivers carry only the household pair. */
  accountId?: string;
  caregiverId?: string;
  householdId?: string;
  startedAt: string;
}

export interface StaffSession {
  staffId: string;
  startedAt: string;
}

const CG = "cs_caregiver";
const ST = "cs_staff";
const PROOF = "cs_proof";
const BB = "cs_bb";
const REVEAL = "cs_reveal";
const DAY = 24 * 60 * 60 * 1000;

export async function setCaregiverSession(s: Omit<CaregiverSession, "startedAt">) {
  (await cookies()).set(CG, await signPayload({ ...s, startedAt: new Date().toISOString() }), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 12 });
}
export async function getCaregiverSession(): Promise<CaregiverSession | null> {
  return verifyPayload<CaregiverSession>((await cookies()).get(CG)?.value, 12 * 60 * 60 * 1000);
}
export async function clearCaregiverSession() {
  (await cookies()).delete(CG);
}

export async function setStaffSession(s: Omit<StaffSession, "startedAt">) {
  (await cookies()).set(ST, await signPayload({ ...s, startedAt: new Date().toISOString() }), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 12 });
}
export async function getStaffSession(): Promise<StaffSession | null> {
  return verifyPayload<StaffSession>((await cookies()).get(ST)?.value, DAY);
}
export async function clearStaffSession() {
  (await cookies()).delete(ST);
}

type FlowKind = "proof" | "bb" | "reveal";
const flowName = (k: FlowKind) => (k === "proof" ? PROOF : k === "bb" ? BB : REVEAL);

const FLOW_MAX_AGE: Record<FlowKind, number> = { proof: 60 * 30, bb: 60 * 30, reveal: 60 * 5 };

export async function setFlowSession(kind: FlowKind, payload: unknown) {
  (await cookies()).set(flowName(kind), await signPayload(payload), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: FLOW_MAX_AGE[kind] });
}
/** Read without consuming (pages cannot modify cookies); the cookie's own max-age bounds the window. */
export async function peekFlowSession<T>(kind: FlowKind): Promise<T | null> {
  return verifyPayload<T>((await cookies()).get(flowName(kind))?.value, FLOW_MAX_AGE[kind] * 1000);
}
export async function takeFlowSession<T>(kind: FlowKind): Promise<T | null> {
  const jar = await cookies();
  const name = flowName(kind);
  const v = await verifyPayload<T>(jar.get(name)?.value, 30 * 60 * 1000);
  jar.delete(name);
  return v;
}
