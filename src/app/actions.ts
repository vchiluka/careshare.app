"use server";

/**
 * All server actions. Every mutation writes an audit entry (ids and outcomes, never clinical
 * content) and revalidates the pages that show it. Pages never mutate directly.
 */

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { Appointment, CareTier, Caregiver, CaregiverAccount, CdrGlobal, ConsentBasis, ContactKind, FastStage, Household, Referral, ResourceCategory, StaffRole, SymptomKind } from "@/lib/domain/types";
import { CLINICAL_LEAD_ROLES } from "@/lib/domain/types";
import { ALL_SCOPES, buildConsent, buildMonthlySummary, CADENCE_DAYS, computeSignals, determineTier, hasActiveConsent, phq2Total, primaryCaregiver, supersedeConsents, zbi12Total } from "@/lib/engine";
import { getBlueButtonAdapter } from "@/lib/integrations/bluebutton";
import { getDirectoryAdapter } from "@/lib/integrations/directory";
import { getEhrAdapter } from "@/lib/integrations/fhir";
import { getIdentityProvider } from "@/lib/integrations/identity";
import { getSmsAdapter } from "@/lib/integrations/sms";
import { clearCaregiverSession, clearStaffSession, getCaregiverSession, getStaffSession, setCaregiverSession, setFlowSession, setStaffSession } from "@/lib/session";
import { getRepository } from "@/lib/store";

const repo = () => getRepository();
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const num = (fd: FormData, k: string) => Number(fd.get(k) ?? 0);
let n = 0;
const newId = (p: string) => `${p}_${Date.now().toString(36)}${(++n).toString(36)}`;

function revalidateAll(householdId?: string) {
  revalidatePath("/clinic", "layout");
  revalidatePath("/care", "layout");
  if (householdId) revalidatePath(`/clinic/households/${householdId}`, "layout");
}

async function requireCaregiver(): Promise<{ h: Household; c: Caregiver; asOf: string; accountId?: string }> {
  const s = await getCaregiverSession();
  if (!s) redirect("/care");
  if (!s.householdId || !s.caregiverId) redirect("/care/start");
  const h = await repo().household(s.householdId);
  const c = h?.caregivers.find((x) => x.id === s.caregiverId);
  if (!h || !c) redirect("/care");
  return { h, c, asOf: await repo().asOf(), accountId: s.accountId };
}

async function requireAccount(): Promise<{ a: CaregiverAccount; asOf: string }> {
  const s = await getCaregiverSession();
  if (!s?.accountId) redirect("/care");
  const a = await repo().account(s.accountId);
  if (!a) redirect("/care");
  return { a, asOf: await repo().asOf() };
}

/** Record access requires identity, proxy and a live consent; actions that write to the record check it too. */
function recordOpen(h: Household, c: Caregiver, asOf: string): boolean {
  return c.identity.status === "verified" && c.identity.assurance === "IAL2" && (c.proxy.status === "confirmed" || c.proxy.status === "self_attested") && hasActiveConsent(h, c.id, asOf);
}

/** Request fingerprint for the consent audit trail: truncated IP and user-agent family only. */
async function attestedFrom(): Promise<string> {
  const hd = await headers();
  const ip = (hd.get("x-forwarded-for") ?? "").split(",")[0].trim();
  const ipShort = ip.includes(".") ? ip.split(".").slice(0, 3).join(".") + ".x" : ip ? ip.split(":").slice(0, 3).join(":") + ":…" : "ip-unknown";
  const ua = hd.get("user-agent") ?? "";
  const fam = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "other";
  return `${ipShort} ${fam}`;
}

async function requireStaff(): Promise<string> {
  const s = await getStaffSession();
  if (!s) redirect("/clinic/sign-in");
  return s.staffId;
}

/** Materialize any new signals as open escalations after a mutation (idempotent by key). */
async function refreshEscalations(id: string) {
  const asOf = await repo().asOf();
  await repo().updateHousehold(id, (h) => {
    const existing = new Set(h.escalations.map((e) => e.key));
    for (const s of computeSignals(h, asOf)) {
      if (s.severity === "info" || existing.has(s.key)) continue;
      h.escalations.unshift({ ...s, id: newId("esc"), raisedOn: s.evidenceDate ?? asOf, status: "open" });
    }
  });
}

// ---------------- Caregiver: session ----------------

export async function signInAsCaregiver(fd: FormData) {
  const caregiverId = str(fd, "caregiverId");
  const householdId = str(fd, "householdId");
  const h = await repo().household(householdId);
  if (!h || !h.caregivers.some((c) => c.id === caregiverId)) redirect("/care");
  await setCaregiverSession({ caregiverId, householdId });
  await repo().audit({ actor: `caregiver:${caregiverId}`, action: "caregiver.sign_in", householdId });
  redirect("/care/home");
}

export async function signOutCaregiver() {
  await clearCaregiverSession();
  redirect("/care");
}

// ---------------- Caregiver: identity and proxy ----------------

export async function startVerification(fd: FormData) {
  const s = await getCaregiverSession();
  if (!s) redirect("/care");
  const providerId = str(fd, "provider") === "clear" ? "clear" : "idme";
  const asAccount = !!s.accountId && !s.householdId;
  const returnUrl = asAccount ? "/care/start" : "/care/home";
  const subject = asAccount ? ({ kind: "account", accountId: s.accountId! } as const) : ({ kind: "caregiver", caregiverId: s.caregiverId!, householdId: s.householdId! } as const);
  const actor = asAccount ? `account:${s.accountId}` : `caregiver:${s.caregiverId}`;
  let provider: ReturnType<typeof getIdentityProvider>;
  let result: Awaited<ReturnType<typeof provider.start>>;
  try {
    provider = getIdentityProvider(providerId);
    result = await provider.start({ subject, returnUrl });
  } catch (e) {
    const reason = (e as Error).message;
    await repo().audit({ actor, action: "identity.start_failed", householdId: s.householdId, reference: providerId, detail: reason });
    redirect(`${returnUrl}?verify=error&reason=${encodeURIComponent(reason)}`);
  }
  await setFlowSession("proof", result.session);
  if (subject.kind === "account") {
    const a = await repo().account(subject.accountId);
    if (a) {
      a.identity = { ...a.identity, status: "pending", provider: providerId, attempts: a.identity.attempts + 1 };
      await repo().upsertAccount(a);
    }
  } else {
    await repo().updateHousehold(subject.householdId, (d) => {
      const cg = d.caregivers.find((x) => x.id === subject.caregiverId)!;
      cg.identity.status = "pending";
      cg.identity.provider = providerId;
      cg.identity.attempts += 1;
    });
  }
  await repo().audit({ actor, action: "identity.start", householdId: s.householdId, reference: `${providerId}:${provider.mode}:${result.state.slice(0, 8)}` });
  redirect(result.redirectUrl);
}

// ---------------- Caregiver: self-service registration ----------------

/**
 * Registration step 1: identity first. A provisional account is created (or the one in the session is
 * reused), the session points at it, and the person is sent to CLEAR or ID.me. The callback marks the
 * account verified and, when the vendor released them, fills name and date of birth from the verified
 * attributes so the person does not retype what the vendor already checked.
 */
export async function startRegistration(fd: FormData) {
  const providerId = str(fd, "provider") === "clear" ? "clear" : "idme";
  const asOf = await repo().asOf();
  const s = await getCaregiverSession();
  let a = s?.accountId ? await repo().account(s.accountId) : undefined;
  if (!a) {
    a = { id: newId("acct"), givenName: "", familyName: "", birthDate: "", phone: "", localityFips: "", access: { smartphone: true, broadband: "low", preferredChannel: "app" }, identity: { status: "not_started", attempts: 0 }, registeredOn: asOf, householdIds: [] };
    await repo().upsertAccount(a);
    await repo().audit({ actor: `account:${a.id}`, action: "account.registration_started", reference: providerId });
  }
  await setCaregiverSession({ accountId: a.id });
  let provider: ReturnType<typeof getIdentityProvider>;
  let result: Awaited<ReturnType<typeof provider.start>>;
  try {
    provider = getIdentityProvider(providerId);
    result = await provider.start({ subject: { kind: "account", accountId: a.id }, returnUrl: "/care/register" });
  } catch (e) {
    const reason = (e as Error).message;
    await repo().audit({ actor: `account:${a.id}`, action: "identity.start_failed", reference: providerId, detail: reason });
    redirect(`/care/register?verify=error&reason=${encodeURIComponent(reason)}`);
  }
  await setFlowSession("proof", result.session);
  a.identity = { ...a.identity, status: "pending", provider: providerId, attempts: a.identity.attempts + 1 };
  await repo().upsertAccount(a);
  await repo().audit({ actor: `account:${a.id}`, action: "identity.start", reference: `${providerId}:${provider.mode}:${result.state.slice(0, 8)}` });
  redirect(result.redirectUrl);
}

/** Registration step 2, after verification: contact details and county. Name and date of birth are prefilled from the vendor when released. */
export async function completeRegistration(fd: FormData) {
  const { a } = await requireAccount();
  if (a.identity.status !== "verified" || a.identity.assurance !== "IAL2") redirect("/care/register");
  const givenName = str(fd, "givenName") || a.givenName;
  const familyName = str(fd, "familyName") || a.familyName;
  const birthDate = str(fd, "birthDate") || a.birthDate;
  const localityFips = str(fd, "localityFips");
  if (!givenName || !familyName || !birthDate || !localityFips) redirect("/care/register?error=missing");
  const smartphone = str(fd, "smartphone") === "on";
  const broadband = (str(fd, "broadband") as "ok" | "low" | "none") || "low";
  Object.assign(a, {
    givenName,
    familyName,
    birthDate,
    phone: str(fd, "phone") || a.phone || "000-000-0000",
    email: str(fd, "email") || a.email,
    localityFips,
    access: { smartphone, broadband, preferredChannel: smartphone ? (broadband === "none" ? "sms" : "app") : "phone" },
  });
  await repo().upsertAccount(a);
  await repo().audit({ actor: `account:${a.id}`, action: "account.registered", reference: localityFips });
  revalidateAll();
  redirect("/care/start");
}

export async function signInAsAccount(fd: FormData) {
  const accountId = str(fd, "accountId");
  const a = await repo().account(accountId);
  if (!a) redirect("/care");
  const hid = a.householdIds[0];
  const h = hid ? await repo().household(hid) : undefined;
  const cg = h?.caregivers.find((c) => c.accountId === a.id);
  await setCaregiverSession({ accountId: a.id, householdId: cg ? h!.id : undefined, caregiverId: cg?.id });
  await repo().audit({ actor: `account:${a.id}`, action: "caregiver.sign_in", householdId: cg ? h!.id : undefined });
  redirect(cg ? "/care/home" : "/care/start");
}

function readConsentForm(fd: FormData): { basis: ConsentBasis; typedSignature: string; shareDirectory: boolean; shareEvaluator: boolean; attest: boolean } {
  const b = str(fd, "basis");
  return {
    basis: b === "poa_healthcare" || b === "legal_guardian" ? b : "patient",
    typedSignature: str(fd, "typedSignature"),
    shareDirectory: str(fd, "shareDirectory") === "on",
    shareEvaluator: str(fd, "shareEvaluator") === "on",
    attest: str(fd, "attest") === "on",
  };
}

/**
 * A verified self-registered caregiver adds the person she cares for. This creates the household at the
 * clinic site for her county with nothing in it but what she typed, records her signed authorization,
 * and opens her own view (proxy self_attested). The clinic confirms her as representative later.
 */
export async function addPatient(fd: FormData) {
  const { a, asOf } = await requireAccount();
  if (a.identity.status !== "verified" || a.identity.assurance !== "IAL2") redirect("/care/start?error=verify_first");
  const form = readConsentForm(fd);
  const givenName = str(fd, "givenName");
  const familyName = str(fd, "familyName");
  const birthDate = str(fd, "birthDate");
  if (!givenName || !familyName || !birthDate) redirect("/care/add-patient?error=missing");
  if (!form.attest || form.typedSignature.length < 3) redirect("/care/add-patient?error=signature");
  const sites = await repo().sites();
  const localityFips = str(fd, "localityFips") || a.localityFips;
  const site = sites.find((x) => x.localityFips === localityFips) ?? sites.find((x) => x.localityFips === a.localityFips) ?? sites[0];
  const hid = newId("hh");
  const cgId = newId("cg");
  const lives = str(fd, "livesWith") === "on";
  const consent = buildConsent({ id: newId("cons"), caregiverId: cgId, basis: form.basis, typedSignature: form.typedSignature, signedAt: new Date().toISOString(), asOf, shareDirectory: form.shareDirectory, shareEvaluator: form.shareEvaluator, attestedFrom: await attestedFrom() });
  const h: Household = {
    id: hid,
    siteId: site.id,
    origin: "self_registered",
    patient: {
      id: newId("pt"),
      givenName,
      familyName,
      birthDate,
      sex: (str(fd, "sex") as "F" | "M") || "F",
      mbi: "SYNTHETIC",
      coverage: { partA: true, partB: true, partC: false, partD: true, medicaid: str(fd, "medicaid") === "on" },
      residence: lives ? "family_home" : "own_home",
      localityFips,
      diagnoses: str(fd, "hasDiagnosis") === "on" ? [{ code: "F03.90", display: "Dementia (type to be confirmed by the clinic)" }] : [],
    },
    caregivers: [
      {
        id: cgId,
        accountId: a.id,
        givenName: a.givenName,
        familyName: a.familyName,
        birthDate: a.birthDate,
        relationship: (str(fd, "relationship") as Caregiver["relationship"]) || "daughter",
        livesWithPatient: lives,
        localityFips: a.localityFips,
        phone: a.phone,
        email: a.email,
        access: a.access,
        isPrimary: true,
        identity: a.identity,
        proxy: { status: "self_attested", requestedOn: asOf, consentBasis: form.basis, consentRecordedOn: asOf, scope: ALL_SCOPES },
        health: { phq2: [], bp: [], zbi: [], hasHomeBpCuff: str(fd, "hasBpCuff") === "on" },
        hoursPerWeek: num(fd, "hoursPerWeek") || (lives ? 40 : 10),
      },
    ],
    consents: [consent],
    status: "enrolling",
    enrolledOn: asOf,
    referralSource: "self",
    carePlan: { tier: null, contactCadenceDays: 30, goals: [], watchFor: ["Sudden change in confusion", "Fall", "Not drinking or new trouble urinating", "Frightening behavior or trying to leave the house"], whoToCall: [{ label: `${site.orgName} (daytime)`, phone: site.phone }, { label: "Emergency", phone: "911" }] },
    medications: [],
    medicareFills: [],
    medicare: { connected: false },
    symptomLog: [],
    appointments: [],
    messages: [],
    contacts: [],
    referrals: [],
    escalations: [],
    edVisits: [],
    summaries: [],
  };
  await repo().addHousehold(h);
  a.householdIds.push(hid);
  await repo().upsertAccount(a);
  await setCaregiverSession({ accountId: a.id, householdId: hid, caregiverId: cgId });
  await repo().audit({ actor: `account:${a.id}`, action: "household.self_registered", householdId: hid, reference: site.id });
  await repo().audit({ actor: `caregiver:${cgId}`, action: "consent.signed", householdId: hid, reference: `${consent.id}:${consent.basis}:v${consent.version}`, detail: consent.attestedFrom });
  await refreshEscalations(hid);
  revalidateAll(hid);
  redirect("/care/connect?signed=1");
}

/** Sign the authorization again (first time for clinic-enrolled caregivers, or the 90-day re-affirmation). */
export async function signConsent(fd: FormData) {
  const { h, c, asOf } = await requireCaregiver();
  const verified = c.identity.status === "verified" && c.identity.assurance === "IAL2";
  if (!verified) redirect("/care/home");
  const form = readConsentForm(fd);
  if (!form.attest || form.typedSignature.length < 3) redirect("/care/consent?error=signature");
  const consent = buildConsent({ id: newId("cons"), caregiverId: c.id, basis: form.basis, typedSignature: form.typedSignature, signedAt: new Date().toISOString(), asOf, shareDirectory: form.shareDirectory, shareEvaluator: form.shareEvaluator, attestedFrom: await attestedFrom() });
  await repo().updateHousehold(h.id, (d) => {
    d.consents = [...supersedeConsents(d.consents ?? [], c.id), consent];
    const cg = d.caregivers.find((x) => x.id === c.id)!;
    if (cg.proxy.status === "not_requested" || cg.proxy.status === "revoked") {
      cg.proxy.status = "requested";
      cg.proxy.requestedOn = asOf;
    }
  });
  await repo().audit({ actor: `caregiver:${c.id}`, action: "consent.signed", householdId: h.id, reference: `${consent.id}:${consent.basis}:v${consent.version}`, detail: consent.attestedFrom });
  revalidateAll(h.id);
  redirect("/care/home?consent=ok");
}

export async function revokeConsent() {
  const { h, c } = await requireCaregiver();
  const now = new Date().toISOString();
  await repo().updateHousehold(h.id, (d) => {
    d.consents = (d.consents ?? []).map((x) => (x.caregiverId === c.id && x.status === "active" ? { ...x, status: "revoked", revokedAt: now } : x));
  });
  await repo().audit({ actor: `caregiver:${c.id}`, action: "consent.revoked", householdId: h.id });
  revalidateAll(h.id);
  redirect("/care/consent");
}

export async function requestProxy() {
  const { h, c, asOf } = await requireCaregiver();
  await repo().updateHousehold(h.id, (d) => {
    const cg = d.caregivers.find((x) => x.id === c.id)!;
    if (cg.proxy.status === "not_requested" || cg.proxy.status === "revoked") {
      cg.proxy.status = "requested";
      cg.proxy.requestedOn = asOf;
    }
  });
  await repo().audit({ actor: `caregiver:${c.id}`, action: "proxy.requested", householdId: h.id });
  await refreshEscalations(h.id);
  revalidateAll(h.id);
}

// ---------------- Caregiver: logging ----------------

export async function logSymptom(fd: FormData) {
  const { h, c, asOf } = await requireCaregiver();
  if (c.proxy.status !== "confirmed") return;
  const kind = str(fd, "kind") as SymptomKind;
  const severity = Math.min(3, Math.max(1, num(fd, "severity"))) as 1 | 2 | 3;
  const note = str(fd, "note").slice(0, 400);
  const date = str(fd, "date") || asOf;
  await repo().updateHousehold(h.id, (d) => d.symptomLog.unshift({ id: newId("sy"), date, kind, severity, note, reportedBy: c.id }));
  await repo().audit({ actor: `caregiver:${c.id}`, action: "symptom.logged", householdId: h.id, reference: kind });
  await refreshEscalations(h.id);
  revalidateAll(h.id);
}

export async function addCaregiverMedication(fd: FormData) {
  const { h, c } = await requireCaregiver();
  if (c.proxy.status !== "confirmed") return;
  const name = str(fd, "name").toLowerCase();
  if (!name) return;
  await repo().updateHousehold(h.id, (d) => d.medications.push({ id: newId("med"), name, strength: str(fd, "strength"), sig: str(fd, "sig"), source: "caregiver", status: "active", note: str(fd, "note") || undefined }));
  await repo().audit({ actor: `caregiver:${c.id}`, action: "medication.caregiver_added", householdId: h.id });
  revalidateAll(h.id);
}

export async function submitZbi(fd: FormData) {
  const { h, c, asOf } = await requireCaregiver();
  const items = Array.from({ length: 12 }, (_, i) => num(fd, `q${i + 1}`));
  const total = zbi12Total(items);
  await repo().updateHousehold(h.id, (d) => {
    const cg = d.caregivers.find((x) => x.id === c.id)!;
    cg.health.zbi.push({ date: asOf, items, total, context: cg.health.zbi.length ? "check_in" : "baseline" });
    if (cg.isPrimary) {
      const t = determineTier(d.staging, true, total);
      if (t.tier && t.tier !== d.carePlan.tier) {
        d.carePlan.tier = t.tier;
        d.carePlan.tierSetOn = asOf;
        d.carePlan.contactCadenceDays = CADENCE_DAYS[t.tier];
      }
    }
  });
  await repo().audit({ actor: `caregiver:${c.id}`, action: "checkin.zbi12", householdId: h.id, reference: `total=${total}` });
  await refreshEscalations(h.id);
  revalidateAll(h.id);
  redirect("/care/checkin?done=zbi");
}

export async function submitPhq2(fd: FormData) {
  const { h, c, asOf } = await requireCaregiver();
  const items: [number, number] = [num(fd, "p1"), num(fd, "p2")];
  const total = phq2Total(items);
  await repo().updateHousehold(h.id, (d) => d.caregivers.find((x) => x.id === c.id)!.health.phq2.push({ date: asOf, items, total }));
  await repo().audit({ actor: `caregiver:${c.id}`, action: "checkin.phq2", householdId: h.id, reference: total >= 3 ? "positive" : "negative" });
  await refreshEscalations(h.id);
  revalidateAll(h.id);
  redirect("/care/checkin?done=phq2");
}

export async function submitBp(fd: FormData) {
  const { h, c, asOf } = await requireCaregiver();
  const systolic = num(fd, "systolic");
  const diastolic = num(fd, "diastolic");
  if (!(systolic > 60 && systolic < 260 && diastolic > 30 && diastolic < 160)) return;
  await repo().updateHousehold(h.id, (d) => {
    const cg = d.caregivers.find((x) => x.id === c.id)!;
    cg.health.bp.push({ date: asOf, systolic, diastolic, source: "home_cuff" });
    cg.health.hasHomeBpCuff = true;
  });
  await repo().audit({ actor: `caregiver:${c.id}`, action: "checkin.bp", householdId: h.id });
  await refreshEscalations(h.id);
  revalidateAll(h.id);
  redirect("/care/checkin?done=bp");
}

export async function recordOwnVisit(fd: FormData) {
  const { h, c, asOf } = await requireCaregiver();
  const date = str(fd, "date") || asOf;
  const when = str(fd, "when"); // "had" | "scheduled"
  await repo().updateHousehold(h.id, (d) => {
    const cg = d.caregivers.find((x) => x.id === c.id)!;
    if (when === "scheduled") cg.health.ownPcpNextScheduled = date;
    else {
      cg.health.ownPcpLastVisit = date;
      cg.health.ownPcpNextScheduled = undefined;
    }
  });
  await repo().audit({ actor: `caregiver:${c.id}`, action: when === "scheduled" ? "caregiver.own_visit_scheduled" : "caregiver.own_visit_recorded", householdId: h.id });
  await refreshEscalations(h.id);
  revalidateAll(h.id);
  redirect("/care/checkin?done=visit");
}

export async function caregiverSendMessage(fd: FormData) {
  const { h, c } = await requireCaregiver();
  if (c.proxy.status !== "confirmed") return;
  const body = str(fd, "body").slice(0, 1000);
  if (!body) return;
  await repo().updateHousehold(h.id, (d) => d.messages.push({ id: newId("msg"), at: new Date().toISOString(), from: "caregiver", authorId: c.id, authorName: c.givenName, body }));
  await repo().audit({ actor: `caregiver:${c.id}`, action: "message.sent", householdId: h.id });
  revalidateAll(h.id);
}

export async function caregiverTransportRequest(fd: FormData) {
  const { h, c } = await requireCaregiver();
  if (c.proxy.status !== "confirmed") return;
  const apptId = str(fd, "appointmentId");
  await repo().updateHousehold(h.id, (d) => {
    const a = d.appointments.find((x) => x.id === apptId);
    if (a) a.transport.needed = true;
  });
  await repo().audit({ actor: `caregiver:${c.id}`, action: "appointment.transport_requested", householdId: h.id, reference: apptId });
  await refreshEscalations(h.id);
  revalidateAll(h.id);
}

export async function connectMedicare() {
  const { h, c, asOf } = await requireCaregiver();
  if (!recordOpen(h, c, asOf) || !c.proxy.scope.includes("medicare_records")) redirect("/care/home");
  const adapter = getBlueButtonAdapter((id) => repo().household(id), () => repo().asOf());
  const r = await adapter.start({ householdId: h.id, returnUrl: h.origin === "self_registered" && !h.medicare.connected ? "/care/connect" : "/care/medications" });
  await setFlowSession("bb", r.session);
  await repo().audit({ actor: `caregiver:${c.id}`, action: "medicare.authorize_start", householdId: h.id, reference: adapter.mode });
  redirect(r.redirectUrl);
}

export async function caregiverReferral(fd: FormData) {
  const { h, c, asOf } = await requireCaregiver();
  const resourceId = str(fd, "resourceId");
  const status = (str(fd, "status") || "contacted") as Referral["status"];
  const note = str(fd, "note");
  const existingId = str(fd, "referralId");
  await repo().updateHousehold(h.id, (d) => {
    const r = existingId ? d.referrals.find((x) => x.id === existingId) : undefined;
    if (r) {
      r.status = status;
      r.updatedOn = asOf;
      if (note) r.outcomeNote = note;
    } else d.referrals.unshift({ id: newId("ref"), resourceId, suggestedOn: asOf, suggestedBy: "caregiver", status, updatedOn: asOf, outcomeNote: note || undefined });
  });
  await repo().audit({ actor: `caregiver:${c.id}`, action: "referral.updated", householdId: h.id, reference: `${resourceId}:${status}` });
  revalidateAll(h.id);
}

// ---------------- Staff: session ----------------

export async function signInAsStaff(fd: FormData) {
  const staffId = str(fd, "staffId");
  const staff = await repo().staff();
  const me = staff.find((s) => s.id === staffId);
  if (!me) redirect("/clinic/sign-in");
  await setStaffSession({ staffId });
  await repo().audit({ actor: `staff:${staffId}`, action: "staff.sign_in" });
  redirect(me.status === "active" ? "/clinic" : "/clinic/pending");
}

/** Clinic staff sign in through CLEAR or ID.me. New subjects land as pending until an admin approves them. */
export async function startStaffVerification(fd: FormData) {
  const providerId = str(fd, "provider") === "clear" ? "clear" : "idme";
  const email = str(fd, "email") || undefined;
  let provider: ReturnType<typeof getIdentityProvider>;
  let result: Awaited<ReturnType<typeof provider.start>>;
  try {
    provider = getIdentityProvider(providerId);
    result = await provider.start({ subject: { kind: "staff", email }, returnUrl: "/clinic/sign-in" });
  } catch (e) {
    const reason = (e as Error).message;
    await repo().audit({ actor: "staff:unknown", action: "identity.start_failed", reference: providerId, detail: reason });
    redirect(`/clinic/sign-in?verify=error&reason=${encodeURIComponent(reason)}`);
  }
  await setFlowSession("proof", result.session);
  await repo().audit({ actor: "staff:unknown", action: "identity.start", reference: `${providerId}:${provider.mode}:${result.state.slice(0, 8)}` });
  redirect(result.redirectUrl);
}

// ---------------- Admin: staff approvals and clinical lead assignment ----------------

async function requireAdmin(): Promise<string> {
  const staffId = await requireStaff();
  const me = (await repo().staff()).find((s) => s.id === staffId);
  if (!me?.isAdmin || me.status !== "active") redirect("/clinic");
  return staffId;
}

export async function approveStaff(fd: FormData) {
  const adminId = await requireAdmin();
  const id = str(fd, "staffId");
  const me = (await repo().staff()).find((s) => s.id === id);
  if (!me) return;
  const role = str(fd, "role") as StaffRole;
  const siteId = str(fd, "siteId");
  const decision = str(fd, "decision");
  if (decision === "disable") {
    me.status = "disabled";
  } else {
    if (role) me.role = role;
    if (siteId) me.siteId = siteId;
    me.credentials = str(fd, "credentials") || me.credentials;
    me.isAdmin = str(fd, "isAdmin") === "on";
    me.status = "active";
    me.approvedBy = adminId;
    me.approvedOn = await repo().asOf();
  }
  await repo().upsertStaff(me);
  await repo().audit({ actor: `staff:${adminId}`, action: decision === "disable" ? "staff.disabled" : "staff.approved", reference: `${me.id}:${me.role}:${me.siteId}` });
  revalidateAll();
}

export async function assignLead(fd: FormData) {
  const adminId = await requireAdmin();
  const householdId = str(fd, "householdId");
  const leadId = str(fd, "leadStaffId");
  const asOf = await repo().asOf();
  const lead = leadId ? (await repo().staff()).find((s) => s.id === leadId) : undefined;
  if (leadId && (!lead || lead.status !== "active" || !CLINICAL_LEAD_ROLES.includes(lead.role))) return;
  await repo().updateHousehold(householdId, (d) => {
    d.assignedLeadStaffId = lead?.id;
    d.assignedOn = lead ? asOf : undefined;
    if (lead && d.siteId !== lead.siteId && str(fd, "moveSite") === "on") d.siteId = lead.siteId;
  });
  await repo().audit({ actor: `staff:${adminId}`, action: lead ? "household.lead_assigned" : "household.lead_cleared", householdId, reference: lead?.id });
  revalidateAll(householdId);
}

export async function signOutStaff() {
  await clearStaffSession();
  redirect("/clinic/sign-in");
}

// ---------------- Staff: proxy and identity ----------------

export async function confirmProxy(fd: FormData) {
  const staffId = await requireStaff();
  const householdId = str(fd, "householdId");
  const caregiverId = str(fd, "caregiverId");
  const basis = (str(fd, "basis") || "patient") as "patient" | "poa_healthcare" | "legal_guardian";
  const asOf = await repo().asOf();
  let ok = false;
  await repo().updateHousehold(householdId, (d) => {
    const cg = d.caregivers.find((x) => x.id === caregiverId);
    if (!cg || cg.identity.status !== "verified" || cg.identity.assurance !== "IAL2") return;
    cg.proxy = { status: "confirmed", consentRecordedOn: asOf, consentBasis: basis, requestedOn: cg.proxy.requestedOn ?? asOf, confirmedOn: asOf, confirmedBy: staffId, scope: ALL_SCOPES };
    ok = true;
  });
  await repo().audit({ actor: `staff:${staffId}`, action: ok ? "proxy.confirmed" : "proxy.confirm_refused", householdId, reference: `${caregiverId}:${basis}`, detail: ok ? undefined : "Caregiver is not identity-verified at IAL2." });
  if (ok) await repo().updateHousehold(householdId, (d) => (d.escalations = d.escalations.filter((e) => e.rule !== "PROXY_NOT_CONFIRMED" || e.status === "resolved")));
  revalidateAll(householdId);
}

export async function revokeProxy(fd: FormData) {
  const staffId = await requireStaff();
  const householdId = str(fd, "householdId");
  const caregiverId = str(fd, "caregiverId");
  const asOf = await repo().asOf();
  await repo().updateHousehold(householdId, (d) => {
    const cg = d.caregivers.find((x) => x.id === caregiverId);
    if (cg) cg.proxy = { ...cg.proxy, status: "revoked", revokedOn: asOf, scope: [] };
  });
  await repo().audit({ actor: `staff:${staffId}`, action: "proxy.revoked", householdId, reference: caregiverId });
  revalidateAll(householdId);
}

/**
 * In-person identity proofing at the clinic: the enrollment coordinator checks a government ID
 * and a second piece of evidence face to face and attests. This is the rural fallback for
 * caregivers who fail remote proofing; it is a documented proofing event, not a bypass.
 */
export async function recordInPersonVerification(fd: FormData) {
  const staffId = await requireStaff();
  const householdId = str(fd, "householdId");
  const caregiverId = str(fd, "caregiverId");
  const attest = str(fd, "attest") === "on";
  if (!attest) return;
  const asOf = await repo().asOf();
  await repo().updateHousehold(householdId, (d) => {
    const cg = d.caregivers.find((x) => x.id === caregiverId);
    if (!cg) return;
    cg.identity = { status: "verified", provider: "in_person", assurance: "IAL2", authenticator: "AAL2", verifiedOn: asOf, subject: `in_person|${staffId}|${caregiverId}`, attempts: cg.identity.attempts + 1 };
    d.escalations = d.escalations.filter((e) => e.rule !== "IDENTITY_NOT_VERIFIED");
  });
  await repo().audit({ actor: `staff:${staffId}`, action: "identity.in_person_verified", householdId, reference: caregiverId, detail: "Staff attested to in-person document check (IAL2 supervised remote/in-person equivalent)." });
  await refreshEscalations(householdId);
  revalidateAll(householdId);
}

// ---------------- Staff: contacts, escalations, plan ----------------

export async function logContact(fd: FormData) {
  const staffId = await requireStaff();
  const householdId = str(fd, "householdId");
  const asOf = await repo().asOf();
  const kind = str(fd, "kind") as ContactKind;
  const minutes = Math.max(1, num(fd, "minutes"));
  const supports = fd.getAll("supports").map(String) as ("care_management" | "caregiver_training" | "cognitive_assessment")[];
  await repo().updateHousehold(householdId, (d) => {
    d.contacts.push({ id: newId("ct"), date: str(fd, "date") || asOf, kind, byStaffId: staffId, minutes, summary: str(fd, "summary").slice(0, 600), supports: supports.length ? supports : ["care_management"] });
    d.escalations = d.escalations.map((e) => (e.rule === "CADENCE_OVERDUE" && e.status !== "resolved" ? { ...e, status: "resolved", resolvedOn: asOf, resolvedBy: staffId, resolution: "Contact logged." } : e));
  });
  await repo().audit({ actor: `staff:${staffId}`, action: "contact.logged", householdId, reference: `${kind}:${minutes}m` });
  revalidateAll(householdId);
}

export async function acknowledgeEscalation(fd: FormData) {
  const staffId = await requireStaff();
  const householdId = str(fd, "householdId");
  const id = str(fd, "escalationId");
  const asOf = await repo().asOf();
  await repo().updateHousehold(householdId, (d) => {
    const e = d.escalations.find((x) => x.id === id);
    if (e && e.status === "open") Object.assign(e, { status: "acknowledged", acknowledgedBy: staffId, acknowledgedOn: asOf });
  });
  await repo().audit({ actor: `staff:${staffId}`, action: "escalation.acknowledged", householdId, reference: id });
  revalidateAll(householdId);
}

export async function resolveEscalation(fd: FormData) {
  const staffId = await requireStaff();
  const householdId = str(fd, "householdId");
  const id = str(fd, "escalationId");
  const resolution = str(fd, "resolution").slice(0, 400);
  const asOf = await repo().asOf();
  await repo().updateHousehold(householdId, (d) => {
    const e = d.escalations.find((x) => x.id === id);
    if (e) Object.assign(e, { status: "resolved", resolvedOn: asOf, resolvedBy: staffId, resolution: resolution || "Resolved." });
  });
  await repo().audit({ actor: `staff:${staffId}`, action: "escalation.resolved", householdId, reference: id });
  revalidateAll(householdId);
}

export async function routePhq2(fd: FormData) {
  const staffId = await requireStaff();
  const householdId = str(fd, "householdId");
  const caregiverId = str(fd, "caregiverId");
  const date = str(fd, "date");
  const asOf = await repo().asOf();
  await repo().updateHousehold(householdId, (d) => {
    const cg = d.caregivers.find((x) => x.id === caregiverId);
    const p = cg?.health.phq2.find((x) => x.date === date);
    if (p) p.routedOn = asOf;
    d.escalations = d.escalations.map((e) => (e.rule === "PHQ2_POSITIVE" && e.status !== "resolved" ? { ...e, status: "resolved", resolvedOn: asOf, resolvedBy: staffId, resolution: "Warm hand-off to caregiver's own provider / behavioral health recorded." } : e));
  });
  await repo().audit({ actor: `staff:${staffId}`, action: "caregiver.phq2_routed", householdId, reference: caregiverId });
  revalidateAll(householdId);
}

export async function completeReconciliation(fd: FormData) {
  const staffId = await requireStaff();
  const householdId = str(fd, "householdId");
  const asOf = await repo().asOf();
  await repo().updateHousehold(householdId, (d) => {
    d.medReconciliationCompletedOn = asOf;
    d.escalations = d.escalations.map((e) => (e.rule === "MED_DISCREPANCY" && e.status !== "resolved" ? { ...e, status: "resolved", resolvedOn: asOf, resolvedBy: staffId, resolution: "Reconciled with caregiver." } : e));
  });
  await repo().audit({ actor: `staff:${staffId}`, action: "medication.reconciliation_completed", householdId });
  revalidateAll(householdId);
}

export async function updateMedication(fd: FormData) {
  const staffId = await requireStaff();
  const householdId = str(fd, "householdId");
  const medId = str(fd, "medicationId");
  const op = str(fd, "op"); // confirm | stop | reactivate
  await repo().updateHousehold(householdId, (d) => {
    const m = d.medications.find((x) => x.id === medId);
    if (!m) return;
    if (op === "confirm") {
      m.source = "clinic";
      m.status = "active";
    } else if (op === "stop") m.status = "stopped";
    else if (op === "reactivate") m.status = "active";
  });
  await repo().audit({ actor: `staff:${staffId}`, action: `medication.${op}`, householdId, reference: medId });
  revalidateAll(householdId);
}

export async function addClinicMedication(fd: FormData) {
  const staffId = await requireStaff();
  const householdId = str(fd, "householdId");
  const name = str(fd, "name").toLowerCase();
  if (!name) return;
  const staff = (await repo().staff()).find((s) => s.id === staffId);
  await repo().updateHousehold(householdId, (d) => d.medications.push({ id: newId("med"), name, strength: str(fd, "strength"), sig: str(fd, "sig"), source: "clinic", status: "active", prescriber: staff?.name }));
  await repo().audit({ actor: `staff:${staffId}`, action: "medication.added", householdId });
  revalidateAll(householdId);
}

export async function addFillFromClaims(fd: FormData) {
  // Clinic adopts a Medicare-filled drug onto the list after confirming with the caregiver.
  const staffId = await requireStaff();
  const householdId = str(fd, "householdId");
  const name = str(fd, "name").toLowerCase();
  const strength = str(fd, "strength");
  await repo().updateHousehold(householdId, (d) => d.medications.push({ id: newId("med"), name, strength, sig: str(fd, "sig") || "as directed", source: "medicare", status: "active", prescriber: str(fd, "prescriber") || "Outside prescriber (confirm)" }));
  await repo().audit({ actor: `staff:${staffId}`, action: "medication.adopted_from_claims", householdId });
  revalidateAll(householdId);
}

export async function updateStaging(fd: FormData) {
  const staffId = await requireStaff();
  const householdId = str(fd, "householdId");
  const asOf = await repo().asOf();
  const cdrRaw = str(fd, "cdr");
  const fast = str(fd, "fast") as FastStage | "";
  const npiq = str(fd, "npiq");
  let tier: CareTier | null = null;
  await repo().updateHousehold(householdId, (d) => {
    d.staging = { cdrGlobal: cdrRaw ? (Number(cdrRaw) as CdrGlobal) : undefined, fast: fast || undefined, assessedOn: asOf, assessedBy: staffId, npiqSeverity: npiq ? Number(npiq) : undefined };
    const p = primaryCaregiver(d);
    const t = determineTier(d.staging, !!p, p?.health.zbi.at(-1)?.total);
    tier = t.tier;
    if (t.tier) {
      d.carePlan.tier = t.tier;
      d.carePlan.tierSetOn = asOf;
      d.carePlan.contactCadenceDays = CADENCE_DAYS[t.tier];
    }
    d.escalations = d.escalations.filter((e) => e.rule !== "STAGING_CONFLICT");
  });
  await repo().audit({ actor: `staff:${staffId}`, action: "staging.updated", householdId, reference: `tier=${tier ?? "unset"}` });
  await refreshEscalations(householdId);
  revalidateAll(householdId);
}

export async function reviewCarePlan(fd: FormData) {
  const staffId = await requireStaff();
  const householdId = str(fd, "householdId");
  const asOf = await repo().asOf();
  const newGoal = str(fd, "newGoal");
  const owner = (str(fd, "owner") || "shared") as "caregiver" | "clinic" | "shared";
  const respite = str(fd, "respite");
  await repo().updateHousehold(householdId, (d) => {
    if (newGoal) d.carePlan.goals.push({ id: newId("g"), text: newGoal.slice(0, 200), owner, status: "active" });
    if (respite) d.carePlan.respiteArrangement = respite.slice(0, 200);
    d.carePlan.reviewedOn = asOf;
    d.carePlan.reviewedBy = staffId;
  });
  await repo().audit({ actor: `staff:${staffId}`, action: "careplan.reviewed", householdId });
  revalidateAll(householdId);
}

export async function setGoalStatus(fd: FormData) {
  const staffId = await requireStaff();
  const householdId = str(fd, "householdId");
  const goalId = str(fd, "goalId");
  const status = str(fd, "status") as "active" | "met" | "dropped";
  await repo().updateHousehold(householdId, (d) => {
    const gl = d.carePlan.goals.find((x) => x.id === goalId);
    if (gl) gl.status = status;
  });
  await repo().audit({ actor: `staff:${staffId}`, action: `careplan.goal_${status}`, householdId, reference: goalId });
  revalidateAll(householdId);
}

export async function scheduleAppointment(fd: FormData) {
  const staffId = await requireStaff();
  const householdId = str(fd, "householdId");
  const a: Appointment = {
    id: newId("ap"),
    date: str(fd, "date"),
    time: str(fd, "time") || undefined,
    purpose: str(fd, "purpose") as Appointment["purpose"],
    withName: str(fd, "withName"),
    location: str(fd, "location"),
    status: "scheduled",
    transport: { needed: str(fd, "transportNeeded") === "on", arranged: false },
    forPerson: "patient",
  };
  if (!a.date) return;
  await repo().updateHousehold(householdId, (d) => d.appointments.push(a));
  await repo().audit({ actor: `staff:${staffId}`, action: "appointment.scheduled", householdId, reference: a.purpose });
  await refreshEscalations(householdId);
  revalidateAll(householdId);
}

export async function updateAppointment(fd: FormData) {
  const staffId = await requireStaff();
  const householdId = str(fd, "householdId");
  const id = str(fd, "appointmentId");
  const op = str(fd, "op"); // arrange | completed | missed | cancelled
  const asOf = await repo().asOf();
  await repo().updateHousehold(householdId, (d) => {
    const a = d.appointments.find((x) => x.id === id);
    if (!a) return;
    if (op === "arrange") {
      a.transport.arranged = true;
      a.transport.provider = str(fd, "provider") || "Arranged by clinic";
      d.escalations = d.escalations.map((e) => (e.key === `TRANSPORT_UNARRANGED:${id}` && e.status !== "resolved" ? { ...e, status: "resolved", resolvedOn: asOf, resolvedBy: staffId, resolution: `Ride arranged: ${a.transport.provider}` } : e));
    } else if (op === "completed" || op === "missed" || op === "cancelled") {
      a.status = op;
      if (op === "completed" && a.purpose === "annual_wellness") d.lastAnnualWellnessOn = a.date;
      if (op === "completed" && a.purpose === "cognitive_assessment") d.lastCognitiveAssessmentOn = a.date;
    }
  });
  await repo().audit({ actor: `staff:${staffId}`, action: `appointment.${op}`, householdId, reference: id });
  await refreshEscalations(householdId);
  revalidateAll(householdId);
}

export async function clinicSendMessage(fd: FormData) {
  const staffId = await requireStaff();
  const householdId = str(fd, "householdId");
  const body = str(fd, "body").slice(0, 1000);
  if (!body) return;
  const staff = (await repo().staff()).find((s) => s.id === staffId);
  await repo().updateHousehold(householdId, (d) => {
    d.messages.push({ id: newId("msg"), at: new Date().toISOString(), from: "clinic", authorId: staffId, authorName: staff?.name ?? staffId, body });
    for (const m of d.messages) if (m.from === "caregiver" && !m.readAt) m.readAt = new Date().toISOString();
  });
  await repo().audit({ actor: `staff:${staffId}`, action: "message.sent", householdId });
  revalidateAll(householdId);
}

export async function sendSmsPrompt(fd: FormData) {
  const staffId = await requireStaff();
  const householdId = str(fd, "householdId");
  const caregiverId = str(fd, "caregiverId");
  const template = str(fd, "template");
  const h = await repo().household(householdId);
  const cg = h?.caregivers.find((c) => c.id === caregiverId);
  if (!h || !cg) return;
  const body =
    template === "verify"
      ? `CareShare: ${cg.givenName}, here is your verification link to see ${h.patient.givenName}'s care plan. Reply HELP for a phone walk-through.`
      : template === "checkin"
        ? `CareShare check-in: on a scale of 0-4, how stressed have you felt this week caring for ${h.patient.givenName}? Reply with a number.`
        : `CareShare: reminder of ${h.patient.givenName}'s visit. Reply RIDE if you need transportation.`;
  const sms = getSmsAdapter();
  const r = await sms.send({ to: cg.phone, body });
  await repo().audit({ actor: `staff:${staffId}`, action: `sms.${template}`, householdId, reference: r.reference });
  revalidateAll(householdId);
}

export async function linkEhr(fd: FormData) {
  const staffId = await requireStaff();
  const householdId = str(fd, "householdId");
  const h = await repo().household(householdId);
  if (!h) return;
  const ehr = getEhrAdapter();
  const m = await ehr.matchPatient({ givenName: h.patient.givenName, familyName: h.patient.familyName, birthDate: h.patient.birthDate });
  if (m) await repo().updateHousehold(householdId, (d) => (d.patient.ehrPatientId = m.ehrPatientId));
  await repo().audit({ actor: `staff:${staffId}`, action: m ? "ehr.linked" : "ehr.no_match", householdId, reference: m?.ehrPatientId });
  revalidateAll(householdId);
}

export async function pushPlanToEhr(fd: FormData) {
  const staffId = await requireStaff();
  const householdId = str(fd, "householdId");
  const h = await repo().household(householdId);
  if (!h?.patient.ehrPatientId) return;
  const ehr = getEhrAdapter();
  const text = [`CareShare shared care plan (${h.carePlan.tier ?? "no tier"}).`, ...h.carePlan.goals.filter((g) => g.status === "active").map((g) => `Goal: ${g.text}`), ...h.carePlan.watchFor.map((w) => `Watch for: ${w}`)].join("\n");
  const r = await ehr.writeCarePlan(h.patient.ehrPatientId, text);
  await repo().audit({ actor: `staff:${staffId}`, action: "ehr.careplan_written", householdId, reference: r.reference });
  revalidateAll(householdId);
}

export async function recordEdVisit(fd: FormData) {
  const staffId = await requireStaff();
  const householdId = str(fd, "householdId");
  await repo().updateHousehold(householdId, (d) => d.edVisits.push({ date: str(fd, "date"), reason: str(fd, "reason").slice(0, 120), source: "partner_reported", admitted: str(fd, "admitted") === "on" }));
  await repo().audit({ actor: `staff:${staffId}`, action: "ed_visit.recorded", householdId });
  await refreshEscalations(householdId);
  revalidateAll(householdId);
}

export async function generateSummary(fd: FormData) {
  const staffId = await requireStaff();
  const householdId = str(fd, "householdId");
  const month = str(fd, "month");
  const asOf = await repo().asOf();
  await repo().updateHousehold(householdId, (d) => {
    const s = buildMonthlySummary(d, month, asOf);
    d.summaries = [...d.summaries.filter((x) => x.month !== month), s].sort((a, b) => a.month.localeCompare(b.month));
  });
  const h = await repo().household(householdId);
  let ref: string | undefined;
  if (h?.patient.ehrPatientId && str(fd, "toEhr") === "on") {
    const s = h.summaries.find((x) => x.month === month)!;
    ref = (await getEhrAdapter().writeNote(h.patient.ehrPatientId, `CareShare monthly summary ${month}`, `${s.contacts} contacts, ${s.contactMinutes} min; ${s.symptomsLogged} symptoms; ${s.notes}`)).reference;
  }
  await repo().audit({ actor: `staff:${staffId}`, action: "summary.generated", householdId, reference: ref ?? month });
  revalidateAll(householdId);
}

export async function clinicReferral(fd: FormData) {
  const staffId = await requireStaff();
  const householdId = str(fd, "householdId");
  const asOf = await repo().asOf();
  const resourceId = str(fd, "resourceId");
  const existingId = str(fd, "referralId");
  const status = (str(fd, "status") || "suggested") as Referral["status"];
  const note = str(fd, "note");
  const reportBack = str(fd, "reportBack") === "on";
  const resources = await repo().resources();
  const res = resources.find((r) => r.id === resourceId);
  let receipt: string | undefined;
  if (reportBack && res) {
    const h = await repo().household(householdId);
    const dir = getDirectoryAdapter(async () => resources);
    receipt = (await dir.reportOutcome({ listingId: res.directory.listingId, localityFips: h!.patient.localityFips, status, category: res.category as ResourceCategory })).receipt;
  }
  await repo().updateHousehold(householdId, (d) => {
    const r = existingId ? d.referrals.find((x) => x.id === existingId) : undefined;
    if (r) {
      r.status = status;
      r.updatedOn = asOf;
      if (note) r.outcomeNote = note;
      if (receipt) r.reportedBackOn = asOf;
    } else d.referrals.unshift({ id: newId("ref"), resourceId, suggestedOn: asOf, suggestedBy: "clinic", status, updatedOn: asOf, outcomeNote: note || undefined, reportedBackOn: receipt ? asOf : undefined });
  });
  await repo().audit({ actor: `staff:${staffId}`, action: receipt ? "referral.reported_back" : "referral.updated", householdId, reference: receipt ?? `${resourceId}:${status}` });
  revalidateAll(householdId);
}

export async function enrollHousehold(fd: FormData) {
  const staffId = await requireStaff();
  const asOf = await repo().asOf();
  const sites = await repo().sites();
  const localityFips = str(fd, "localityFips");
  const site = sites.find((s) => s.localityFips === localityFips) ?? sites[0];
  const hid = newId("hh");
  const cgName = str(fd, "cgGivenName");
  const h: Household = {
    id: hid,
    siteId: site.id,
    patient: { id: newId("pt"), givenName: str(fd, "givenName"), familyName: str(fd, "familyName"), birthDate: str(fd, "birthDate"), sex: (str(fd, "sex") as "F" | "M") || "F", mbi: "SYNTHETIC", coverage: { partA: true, partB: true, partC: str(fd, "partC") === "on", partD: true, medicaid: str(fd, "medicaid") === "on" }, residence: "family_home", localityFips, diagnoses: [{ code: str(fd, "dxCode") || "F03.90", display: str(fd, "dxDisplay") || "Unspecified dementia" }] },
    caregivers: cgName
      ? [
          {
            id: newId("cg"),
            givenName: cgName,
            familyName: str(fd, "cgFamilyName") || str(fd, "familyName"),
            birthDate: str(fd, "cgBirthDate") || "1965-01-01",
            relationship: (str(fd, "relationship") as Caregiver["relationship"]) || "daughter",
            livesWithPatient: str(fd, "livesWith") === "on",
            localityFips,
            phone: str(fd, "cgPhone") || "000-000-0000",
            access: { smartphone: str(fd, "smartphone") === "on", broadband: (str(fd, "broadband") as "ok" | "low" | "none") || "low", preferredChannel: str(fd, "smartphone") === "on" ? "app" : "sms" },
            isPrimary: true,
            identity: { status: "not_started", attempts: 0 },
            proxy: { status: "not_requested", scope: [] },
            health: { phq2: [], bp: [], zbi: [], hasHomeBpCuff: false },
            hoursPerWeek: 20,
          },
        ]
      : [],
    origin: "clinic_enrolled",
    consents: [],
    assignedLeadStaffId: str(fd, "leadStaffId") || undefined,
    assignedOn: str(fd, "leadStaffId") ? asOf : undefined,
    status: "enrolling",
    enrolledOn: asOf,
    referralSource: (str(fd, "referralSource") as Household["referralSource"]) || "clinic",
    carePlan: { tier: null, contactCadenceDays: 30, goals: [], watchFor: ["Sudden change in confusion", "Fall", "Not drinking or new trouble urinating", "Frightening behavior or trying to leave the house"], whoToCall: [{ label: `${site.orgName} (daytime)`, phone: site.phone }, { label: "Emergency", phone: "911" }] },
    medications: [],
    medicareFills: [],
    medicare: { connected: false },
    symptomLog: [],
    appointments: [],
    messages: [],
    contacts: [],
    referrals: [],
    escalations: [],
    edVisits: [],
    summaries: [],
  };
  if (!h.patient.givenName || !h.patient.familyName || !h.patient.birthDate || !localityFips) return;
  await repo().addHousehold(h);
  await repo().audit({ actor: `staff:${staffId}`, action: "household.enrolled", householdId: hid, reference: localityFips });
  revalidateAll(hid);
  redirect(`/clinic/households/${hid}`);
}

export async function resetDemo() {
  await repo().reset();
  await repo().audit({ actor: "system", action: "demo.reset" });
  revalidateAll();
}
