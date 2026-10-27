/**
 * Live Blue Button 2.0 adapter (sandbox or production, by env).
 *
 *   BB_CLIENT_ID, BB_CLIENT_SECRET, BB_REDIRECT_URI       required
 *   BB_BASE_URL                                           default https://sandbox.bluebutton.cms.gov
 *   BB_SCOPES                                             default "patient/Patient.read patient/Coverage.read patient/ExplanationOfBenefit.read"
 *   BB_MAX_PAGES                                          default 20 (EOB pagination, _count=100)
 *
 * Tokens are used once at the callback to pull Patient, Coverage and every ExplanationOfBenefit
 * type, then discarded. Storing the refresh token for a monthly re-pull is a follow-up once the
 * Postgres store gets an encrypted token table.
 */

import { pkcePair, randomToken } from "../crypto";
import { mapBlueButton, resourcesOf, type FhirBundle } from "./fhir";
import type { BlueButtonAdapter, BlueButtonCompleteResult, BlueButtonStartResult } from "./types";

function cfg() {
  const clientId = process.env.BB_CLIENT_ID;
  const clientSecret = process.env.BB_CLIENT_SECRET;
  const redirectUri = process.env.BB_REDIRECT_URI;
  const missing = [!clientId && "BB_CLIENT_ID", !clientSecret && "BB_CLIENT_SECRET", !redirectUri && "BB_REDIRECT_URI"].filter(Boolean);
  if (missing.length) throw new Error(`BLUEBUTTON_ADAPTER=live but ${missing.join(", ")} not set. See .env.example.`);
  return {
    clientId: clientId!,
    clientSecret: clientSecret!,
    redirectUri: redirectUri!,
    base: (process.env.BB_BASE_URL ?? "https://sandbox.bluebutton.cms.gov").replace(/\/$/, ""),
    scopes: process.env.BB_SCOPES ?? "patient/Patient.read patient/Coverage.read patient/ExplanationOfBenefit.read",
    maxPages: Number(process.env.BB_MAX_PAGES ?? 20),
  };
}

export function createLiveBlueButtonAdapter(): BlueButtonAdapter {
  const c = cfg();
  return {
    mode: "live",
    async start({ householdId, returnUrl }): Promise<BlueButtonStartResult> {
      const state = randomToken(24);
      const { verifier, challenge } = await pkcePair();
      const u = new URL(`${c.base}/v2/o/authorize/`);
      u.searchParams.set("client_id", c.clientId);
      u.searchParams.set("redirect_uri", c.redirectUri);
      u.searchParams.set("response_type", "code");
      u.searchParams.set("state", state);
      u.searchParams.set("scope", c.scopes);
      u.searchParams.set("code_challenge", challenge);
      u.searchParams.set("code_challenge_method", "S256");
      return { redirectUrl: u.toString(), session: { state, codeVerifier: verifier, householdId, returnUrl, startedAt: new Date().toISOString() } };
    },
    async complete({ params, session }): Promise<BlueButtonCompleteResult> {
      if (params.error) return { ok: false, failureReason: `${params.error}: ${params.error_description ?? ""}` };
      if (params.state !== session.state) return { ok: false, failureReason: "State mismatch." };
      if (!params.code) return { ok: false, failureReason: "No authorization code." };
      const body = new URLSearchParams({ grant_type: "authorization_code", code: params.code, redirect_uri: c.redirectUri, code_verifier: session.codeVerifier ?? "", client_id: c.clientId, client_secret: c.clientSecret });
      const tr = await fetch(`${c.base}/v2/o/token/`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body, cache: "no-store" });
      if (!tr.ok) return { ok: false, failureReason: `Token exchange failed (${tr.status}).` };
      const tok = (await tr.json()) as { access_token: string; patient?: string };
      const auth = { authorization: `Bearer ${tok.access_token}`, accept: "application/fhir+json" };

      const getJson = async <T,>(url: string): Promise<T | undefined> => {
        const r = await fetch(url, { headers: auth, cache: "no-store" });
        return r.ok ? ((await r.json()) as T) : undefined;
      };
      const pages = async (first: string): Promise<Record<string, unknown>[]> => {
        const out: Record<string, unknown>[] = [];
        let url: string | undefined = first;
        for (let i = 0; url && i < c.maxPages; i++) {
          const b: FhirBundle | undefined = await getJson<FhirBundle>(url);
          if (!b) break;
          out.push(...resourcesOf(b));
          url = b.link?.find((l: { relation?: string; url?: string }) => l.relation === "next")?.url;
        }
        return out;
      };

      const patientRef = tok.patient ?? (await getJson<FhirBundle>(`${c.base}/v2/fhir/Patient/`).then((b) => (b ? (resourcesOf(b)[0]?.id as string | undefined) : undefined)));
      const patient = patientRef ? await getJson<Record<string, unknown>>(`${c.base}/v2/fhir/Patient/${patientRef}`) : undefined;
      const coverages = await pages(`${c.base}/v2/fhir/Coverage/?${patientRef ? `beneficiary=${patientRef}&` : ""}_count=100`);
      const eobs = await pages(`${c.base}/v2/fhir/ExplanationOfBenefit/?${patientRef ? `patient=${patientRef}&` : ""}_count=100`);
      const pulledOn = new Date().toISOString().slice(0, 10);
      return { ok: true, patientRef, import: mapBlueButton({ patient, coverages, eobs, pulledOn, source: "live", baseUrl: c.base }) };
    },
  };
}
