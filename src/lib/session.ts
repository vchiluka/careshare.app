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

export async function setFlowSession(kind: "proof" | "bb", payload: unknown) {
  (await cookies()).set(kind === "proof" ? PROOF : BB, await signPayload(payload), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 30 });
}
export async function takeFlowSession<T>(kind: "proof" | "bb"): Promise<T | null> {
  const jar = await cookies();
  const name = kind === "proof" ? PROOF : BB;
  const v = await verifyPayload<T>(jar.get(name)?.value, 30 * 60 * 1000);
  jar.delete(name);
  return v;
}
