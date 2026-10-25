/**
 * Live Blue Button 2.0 adapter (sandbox or production, by env).
 *
 *   BB_CLIENT_ID, BB_CLIENT_SECRET, BB_REDIRECT_URI       required
 *   BB_BASE_URL                                           default https://sandbox.bluebutton.cms.gov
 *   BB_SCOPES                                             default "patient/Patient.read patient/Coverage.read patient/ExplanationOfBenefit.read"
 *
 * Tokens are used once at the callback to pull Part D fills and coverage, then discarded. The
 * memory store has nowhere safe to keep a refresh token; the Postgres driver adds an encrypted
 * token table and a monthly re-pull before the clinic's reconciliation pass.
 */

import { pkcePair, randomToken } from "../crypto";
import type { BlueButtonAdapter, BlueButtonCompleteResult, BlueButtonStartResult, MedicareCoverage, MedicareFill } from "./types";

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
  };
}

interface FhirBundle {
  entry?: { resource: Record<string, unknown> }[];
  link?: { relation: string; url: string }[];
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

      const patientRef = tok.patient ?? (await (await fetch(`${c.base}/v2/fhir/Patient/`, { headers: auth, cache: "no-store" })).json().then((b: FhirBundle) => (b.entry?.[0]?.resource?.id as string | undefined)));

      const fills: MedicareFill[] = [];
      let url: string | undefined = `${c.base}/v2/fhir/ExplanationOfBenefit/?type=pde&_count=100${patientRef ? `&patient=${patientRef}` : ""}`;
      let pages = 0;
      while (url && pages < 10) {
        const r = await fetch(url, { headers: auth, cache: "no-store" });
        if (!r.ok) break;
        const bundle = (await r.json()) as FhirBundle;
        for (const e of bundle.entry ?? []) fills.push(...fillsFromEob(e.resource));
        url = bundle.link?.find((l) => l.relation === "next")?.url;
        pages += 1;
      }

      let coverage: MedicareCoverage | undefined;
      try {
        const cr = await fetch(`${c.base}/v2/fhir/Coverage/?${patientRef ? `beneficiary=${patientRef}` : ""}`, { headers: auth, cache: "no-store" });
        if (cr.ok) coverage = coverageFromBundle((await cr.json()) as FhirBundle);
      } catch {
        /* coverage is optional */
      }

      return { ok: true, patientRef, fills, coverage, pulledOn: new Date().toISOString().slice(0, 10) };
    },
  };
}

/** Map a Part D event (PDE) ExplanationOfBenefit to fills: NDC, display, service date, days supply. */
export function fillsFromEob(eob: Record<string, unknown>): MedicareFill[] {
  const items = (eob.item as Record<string, unknown>[] | undefined) ?? [];
  const info = (eob.supportingInfo as Record<string, unknown>[] | undefined) ?? [];
  const daysSupply = Number(
    info.find((i) => JSON.stringify(i.category ?? {}).toLowerCase().includes("dayssupply"))?.valueQuantity && (info.find((i) => JSON.stringify(i.category ?? {}).toLowerCase().includes("dayssupply"))!.valueQuantity as { value?: number }).value,
  );
  const out: MedicareFill[] = [];
  for (const it of items) {
    const coding = ((it.productOrService as { coding?: { system?: string; code?: string; display?: string }[] } | undefined)?.coding ?? []).find((cd) => (cd.system ?? "").includes("ndc"));
    if (!coding?.code) continue;
    const display = coding.display ?? "Unknown drug";
    const [name, ...rest] = display.split(/\s+(?=\d)/);
    out.push({ ndc: coding.code, name: name.toLowerCase(), strength: rest.join(" "), fillOn: String(it.servicedDate ?? (eob.billablePeriod as { start?: string } | undefined)?.start ?? "").slice(0, 10), daysSupply: Number.isFinite(daysSupply) && daysSupply > 0 ? daysSupply : 30 });
  }
  return out;
}

export function coverageFromBundle(b: FhirBundle): MedicareCoverage {
  const cov: MedicareCoverage = { partA: false, partB: false, partC: false, partD: false };
  for (const e of b.entry ?? []) {
    const r = e.resource as { id?: string; status?: string; type?: { coding?: { code?: string }[] }; extension?: { url?: string; valueCoding?: { code?: string } }[] };
    const id = (r.id ?? "").toLowerCase();
    const active = r.status === "active";
    if (id.startsWith("part-a")) cov.partA = active;
    if (id.startsWith("part-b")) cov.partB = active;
    if (id.startsWith("part-c")) cov.partC = active;
    if (id.startsWith("part-d")) cov.partD = active;
    const dual = r.extension?.find((x) => (x.url ?? "").includes("dual"))?.valueCoding?.code;
    if (dual && dual !== "00" && dual !== "NA") cov.dualEligible = true;
  }
  return cov;
}
