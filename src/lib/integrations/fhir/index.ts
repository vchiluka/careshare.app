/**
 * EHR connection (FHIR R4).
 *
 * The Clinic Console works standalone (day 90 of the pilot: manual summary exchange). The EHR
 * adapter is the month-five integration: match the patient, read conditions and encounters,
 * write the shared care plan and the monthly summary back as a CarePlan and DocumentReference.
 *
 *   EHR_ADAPTER=mock (default) | generic-fhir
 *   FHIR_BASE_URL, FHIR_CLIENT_ID, FHIR_PRIVATE_KEY_PEM (PKCS8), FHIR_KEY_ID, FHIR_SCOPES
 *     for SMART Backend Services (client_credentials with a private_key_jwt assertion).
 *
 * The partner clinic's vendor is not known yet; the generic adapter targets any certified R4
 * server with SMART Backend Services, which every ONC-certified EHR exposes.
 */

import { SignJWT, importPKCS8 } from "jose";
import { randomToken } from "../crypto";

export interface EhrCondition {
  code: string;
  display: string;
  onset?: string;
}

export interface EhrEncounter {
  date: string;
  type: string;
  provider?: string;
}

export interface EhrAdapter {
  readonly mode: "mock" | "live";
  readonly label: string;
  matchPatient(input: { givenName: string; familyName: string; birthDate: string }): Promise<{ ehrPatientId: string } | null>;
  conditions(ehrPatientId: string): Promise<EhrCondition[]>;
  encounters(ehrPatientId: string, sinceDate: string): Promise<EhrEncounter[]>;
  /** Returns the server-side reference of the written resource. */
  writeCarePlan(ehrPatientId: string, planText: string): Promise<{ reference: string }>;
  writeNote(ehrPatientId: string, title: string, text: string): Promise<{ reference: string }>;
}

export function createMockEhrAdapter(): EhrAdapter {
  return {
    mode: "mock",
    label: "Mock EHR (synthetic)",
    async matchPatient(i) {
      return { ehrPatientId: `ehr-${i.familyName.toLowerCase()}-${i.birthDate.replaceAll("-", "")}` };
    },
    async conditions() {
      return [];
    },
    async encounters() {
      return [];
    },
    async writeCarePlan() {
      return { reference: `CarePlan/mock-${randomToken(6)}` };
    },
    async writeNote() {
      return { reference: `DocumentReference/mock-${randomToken(6)}` };
    },
  };
}

function liveCfg() {
  const base = process.env.FHIR_BASE_URL;
  const clientId = process.env.FHIR_CLIENT_ID;
  const pem = process.env.FHIR_PRIVATE_KEY_PEM?.replaceAll("\\n", "\n");
  const missing = [!base && "FHIR_BASE_URL", !clientId && "FHIR_CLIENT_ID", !pem && "FHIR_PRIVATE_KEY_PEM"].filter(Boolean);
  if (missing.length) throw new Error(`EHR_ADAPTER=generic-fhir but ${missing.join(", ")} not set. See .env.example.`);
  return { base: base!.replace(/\/$/, ""), clientId: clientId!, pem: pem!, kid: process.env.FHIR_KEY_ID, scopes: process.env.FHIR_SCOPES ?? "system/Patient.rs system/Condition.rs system/Encounter.rs system/CarePlan.cu system/DocumentReference.c" };
}

export function createGenericFhirAdapter(): EhrAdapter {
  const c = liveCfg();
  let token: { value: string; exp: number } | undefined;

  async function tokenEndpoint(): Promise<string> {
    const r = await fetch(`${c.base}/.well-known/smart-configuration`, { cache: "no-store" });
    if (!r.ok) throw new Error(`SMART discovery failed (${r.status})`);
    return ((await r.json()) as { token_endpoint: string }).token_endpoint;
  }

  async function accessToken(): Promise<string> {
    if (token && token.exp > Date.now() + 30_000) return token.value;
    const te = await tokenEndpoint();
    const key = await importPKCS8(c.pem, "RS384");
    const assertion = await new SignJWT({})
      .setProtectedHeader({ alg: "RS384", typ: "JWT", ...(c.kid ? { kid: c.kid } : {}) })
      .setIssuer(c.clientId)
      .setSubject(c.clientId)
      .setAudience(te)
      .setJti(randomToken(16))
      .setExpirationTime("4m")
      .sign(key);
    const body = new URLSearchParams({ grant_type: "client_credentials", scope: c.scopes, client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer", client_assertion: assertion });
    const r = await fetch(te, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body, cache: "no-store" });
    if (!r.ok) throw new Error(`FHIR token request failed (${r.status})`);
    const j = (await r.json()) as { access_token: string; expires_in?: number };
    token = { value: j.access_token, exp: Date.now() + (j.expires_in ?? 300) * 1000 };
    return token.value;
  }

  async function fhir(path: string, init?: RequestInit): Promise<Record<string, unknown>> {
    const r = await fetch(`${c.base}/${path}`, { ...init, headers: { ...(init?.headers ?? {}), authorization: `Bearer ${await accessToken()}`, accept: "application/fhir+json", "content-type": "application/fhir+json" }, cache: "no-store" });
    if (!r.ok) throw new Error(`FHIR ${path} failed (${r.status})`);
    return (await r.json()) as Record<string, unknown>;
  }

  type Bundle = { entry?: { resource: Record<string, unknown> }[] };

  return {
    mode: "live",
    label: `FHIR R4 at ${new URL(c.base).host}`,
    async matchPatient(i) {
      const b = (await fhir(`Patient?family=${encodeURIComponent(i.familyName)}&given=${encodeURIComponent(i.givenName)}&birthdate=${i.birthDate}`)) as Bundle;
      const id = b.entry?.[0]?.resource?.id as string | undefined;
      return id ? { ehrPatientId: id } : null;
    },
    async conditions(id) {
      const b = (await fhir(`Condition?patient=${id}&clinical-status=active`)) as Bundle;
      return (b.entry ?? []).map((e) => {
        const r = e.resource as { code?: { coding?: { code?: string; display?: string }[] }; onsetDateTime?: string };
        const cd = r.code?.coding?.[0];
        return { code: cd?.code ?? "", display: cd?.display ?? "", onset: r.onsetDateTime?.slice(0, 10) };
      });
    },
    async encounters(id, since) {
      const b = (await fhir(`Encounter?patient=${id}&date=ge${since}`)) as Bundle;
      return (b.entry ?? []).map((e) => {
        const r = e.resource as { period?: { start?: string }; type?: { text?: string; coding?: { display?: string }[] }[] };
        return { date: r.period?.start?.slice(0, 10) ?? "", type: r.type?.[0]?.text ?? r.type?.[0]?.coding?.[0]?.display ?? "encounter" };
      });
    },
    async writeCarePlan(id, planText) {
      const r = await fhir("CarePlan", { method: "POST", body: JSON.stringify({ resourceType: "CarePlan", status: "active", intent: "plan", subject: { reference: `Patient/${id}` }, description: planText }) });
      return { reference: `CarePlan/${r.id as string}` };
    },
    async writeNote(id, title, text) {
      const r = await fhir("DocumentReference", {
        method: "POST",
        body: JSON.stringify({ resourceType: "DocumentReference", status: "current", type: { text: title }, subject: { reference: `Patient/${id}` }, content: [{ attachment: { contentType: "text/plain", data: btoa(unescape(encodeURIComponent(text))) } }] }),
      });
      return { reference: `DocumentReference/${r.id as string}` };
    },
  };
}

export function ehrMode(): "mock" | "generic-fhir" {
  const v = process.env.EHR_ADAPTER ?? "mock";
  if (v !== "mock" && v !== "generic-fhir") throw new Error(`EHR_ADAPTER must be mock or generic-fhir, got "${v}".`);
  return v;
}

export function getEhrAdapter(): EhrAdapter {
  return ehrMode() === "generic-fhir" ? createGenericFhirAdapter() : createMockEhrAdapter();
}
