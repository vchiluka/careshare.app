/**
 * Live OpenID Connect identity provider (ID.me, CLEAR Verified).
 *
 * Authorization code flow with PKCE (S256), state and nonce bound to a signed session cookie,
 * ID token verified against the provider's JWKS (issuer, audience, nonce, expiry), optional
 * userinfo call for the released attributes. Configuration is entirely from environment variables
 * so the same code serves a sandbox and production, and either vendor:
 *
 *   <P>_CLIENT_ID, <P>_CLIENT_SECRET, <P>_REDIRECT_URI          required
 *   <P>_ISSUER                                                   required unless the endpoints below are set
 *   <P>_AUTHORIZATION_ENDPOINT, <P>_TOKEN_ENDPOINT,
 *   <P>_JWKS_URI, <P>_USERINFO_ENDPOINT                          optional overrides of discovery
 *   <P>_SCOPES                                                   space-separated; include the IAL2/AAL2 scope
 *                                                                the vendor provisioned for your account
 *   <P>_ACR_VALUES                                               optional acr_values parameter
 *   <P>_TOKEN_AUTH                                               client_secret_post (default) | client_secret_basic
 *   <P>_ASSURANCE_MODE                                           scope (default) | claims
 *
 * where <P> is IDME or CLEAR.
 *
 * Assurance: with ASSURANCE_MODE=scope the provider is trusted to enforce the requested
 * assurance scope before issuing tokens (ID.me's documented behavior for its IAL2/AAL2 scopes),
 * so a successful token exchange is recorded as IAL2/AAL2 and the raw acr/ial/aal claims are kept
 * as evidence. With ASSURANCE_MODE=claims the levels are read from acr/ial/aal claims and anything
 * short of IAL2 is recorded as IAL1 and does not unlock the record.
 *
 * Secrets are never logged. The audit trail records that a verification happened and the
 * provider's subject id, not token contents.
 */

import { createRemoteJWKSet, decodeJwt, jwtVerify, type JWTPayload } from "jose";
import { pkcePair, randomToken } from "../crypto";
import type { CompleteProofingInput, CompleteProofingResult, IdentityProvider, IdentityProviderId, StartProofingInput, StartProofingResult } from "./types";

interface OidcConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  issuer?: string;
  authorizationEndpoint?: string;
  tokenEndpoint?: string;
  jwksUri?: string;
  userinfoEndpoint?: string;
  scopes: string;
  acrValues?: string;
  tokenAuth: "client_secret_post" | "client_secret_basic";
  assuranceMode: "scope" | "claims";
}

const DEFAULT_SCOPES: Record<IdentityProviderId, string> = {
  // ID.me passes the verification policy inside the scope as "openid <policy handle>". The handle is
  // assigned per app by ID.me (docs.id.me shows nist_aal2_ial2 for IAL2/AAL2); set IDME_SCOPES to yours.
  idme: "openid nist_aal2_ial2",
  // CLEAR Verified: openid is enough; offline/offline_access only add a refresh token.
  clear: "openid",
};

/** CLEAR publishes fixed endpoints (docs.clearme.com) and no discovery document. */
const CLEAR_DEFAULT_ENDPOINTS = {
  issuer: "https://verified.clearme.com/integrations",
  authorization_endpoint: "https://verified.clearme.com/integrations/oauth2/auth",
  token_endpoint: "https://verified.clearme.com/integrations/oauth2/token",
  jwks_uri: "https://verified.clearme.com/integrations/.well-known/jwks.json",
};

export function readOidcConfig(id: IdentityProviderId): OidcConfig {
  const P = id.toUpperCase();
  const env = (k: string) => process.env[`${P}_${k}`]?.trim() || undefined;
  const clientId = env("CLIENT_ID");
  const clientSecret = env("CLIENT_SECRET");
  const redirectUri = env("REDIRECT_URI");
  const missing = [!clientId && `${P}_CLIENT_ID`, !clientSecret && `${P}_CLIENT_SECRET`, !redirectUri && `${P}_REDIRECT_URI`].filter(Boolean);
  if (missing.length) throw new Error(`Live ${id} identity provider selected but ${missing.join(", ")} not set. See .env.example.`);
  const clearDefaults = id === "clear" ? CLEAR_DEFAULT_ENDPOINTS : undefined;
  const issuer = env("ISSUER") ?? clearDefaults?.issuer;
  const authorizationEndpoint = env("AUTHORIZATION_ENDPOINT") ?? clearDefaults?.authorization_endpoint;
  const tokenEndpoint = env("TOKEN_ENDPOINT") ?? clearDefaults?.token_endpoint;
  const jwksUri = env("JWKS_URI") ?? clearDefaults?.jwks_uri;
  if (!issuer && !(authorizationEndpoint && tokenEndpoint && jwksUri)) {
    throw new Error(`Set ${P}_ISSUER (for discovery) or ${P}_AUTHORIZATION_ENDPOINT, ${P}_TOKEN_ENDPOINT and ${P}_JWKS_URI.`);
  }
  return {
    clientId: clientId!,
    clientSecret: clientSecret!,
    redirectUri: redirectUri!,
    issuer,
    authorizationEndpoint,
    tokenEndpoint,
    jwksUri,
    userinfoEndpoint: env("USERINFO_ENDPOINT"),
    scopes: env("SCOPES") ?? DEFAULT_SCOPES[id],
    acrValues: env("ACR_VALUES"),
    tokenAuth: (env("TOKEN_AUTH") as OidcConfig["tokenAuth"]) ?? "client_secret_post",
    assuranceMode: (env("ASSURANCE_MODE") as OidcConfig["assuranceMode"]) ?? "scope",
  };
}

interface Discovery {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  userinfo_endpoint?: string;
}

const discoveryCache = new Map<string, Promise<Discovery>>();

async function discover(cfg: OidcConfig): Promise<Discovery> {
  if (cfg.authorizationEndpoint && cfg.tokenEndpoint && cfg.jwksUri) {
    return { issuer: cfg.issuer ?? "", authorization_endpoint: cfg.authorizationEndpoint, token_endpoint: cfg.tokenEndpoint, jwks_uri: cfg.jwksUri, userinfo_endpoint: cfg.userinfoEndpoint };
  }
  // Try the issuer path first, then the host root: ID.me's issuer is https://api.idmelabs.com/oidc but
  // its discovery document is served at https://api.idmelabs.com/.well-known/openid-configuration.
  const issuer = cfg.issuer!.replace(/\/$/, "");
  const candidates = [...new Set([`${issuer}/.well-known/openid-configuration`, `${new URL(issuer).origin}/.well-known/openid-configuration`])];
  const url = candidates[0];
  if (!discoveryCache.has(url)) {
    discoveryCache.set(
      url,
      (async () => {
        let d: Discovery | undefined;
        const tried: string[] = [];
        for (const c of candidates) {
          const r = await fetch(c, { cache: "no-store" });
          tried.push(`${c} → ${r.status}`);
          if (r.ok) {
            d = (await r.json()) as Discovery;
            break;
          }
        }
        if (!d) throw new Error(`OIDC discovery failed: ${tried.join("; ")}`);
        return {
          issuer: d.issuer,
          authorization_endpoint: cfg.authorizationEndpoint ?? d.authorization_endpoint,
          token_endpoint: cfg.tokenEndpoint ?? d.token_endpoint,
          jwks_uri: cfg.jwksUri ?? d.jwks_uri,
          userinfo_endpoint: cfg.userinfoEndpoint ?? d.userinfo_endpoint,
        };
      })(),
    );
  }
  return discoveryCache.get(url)!;
}

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
function jwks(uri: string) {
  if (!jwksCache.has(uri)) jwksCache.set(uri, createRemoteJWKSet(new URL(uri)));
  return jwksCache.get(uri)!;
}

/**
 * Assurance from what each vendor actually returns:
 *   ID.me  — no acr/ial/aal claims; the policy handle in the scope (e.g. nist_aal2_ial2) is what the
 *            vendor enforced before issuing tokens, so a success under an IAL2 policy is IAL2/AAL2.
 *   CLEAR  — identity tokens carry verification_status ("success"), verification_is_sandbox, amr.
 *            CLEAR Verified is an IAL2 proofing service; a successful verification is IAL2/AAL2.
 * ASSURANCE_MODE=claims ignores both shortcuts and requires explicit acr/ial/aal claims.
 */
function assuranceFrom(claims: JWTPayload, cfg: OidcConfig, id: IdentityProviderId): { ial: "IAL1" | "IAL2"; aal: "AAL1" | "AAL2"; evidence: string } {
  const c = claims as Record<string, unknown>;
  const acr = typeof claims.acr === "string" ? claims.acr : undefined;
  const ial = c.ial;
  const aal = c.aal;
  const verificationStatus = typeof c.verification_status === "string" ? c.verification_status : undefined;
  const sandbox = c.verification_is_sandbox === true || c.verification_is_sandbox === "true";
  const amr = Array.isArray(claims.amr) ? claims.amr.join(",") : "-";
  const evidence = `acr=${acr ?? "-"} ial=${ial ?? "-"} aal=${aal ?? "-"} verification_status=${verificationStatus ?? "-"} sandbox=${sandbox} amr=${amr} scopes="${cfg.scopes}"`;
  const text = `${acr ?? ""} ${ial ?? ""} ${aal ?? ""}`;
  const claimsSayIal2 = /ial\/2|ial2/.test(text) || ial === 2 || ial === "2";
  const claimsSayAal2 = /aal\/2|aal2/.test(text) || aal === 2 || aal === "2";
  if (cfg.assuranceMode === "claims") {
    return { ial: claimsSayIal2 ? "IAL2" : "IAL1", aal: claimsSayAal2 ? "AAL2" : "AAL1", evidence: `${evidence} mode=claims` };
  }
  const policyAsksIal2 = /ial\/2|ial2/i.test(cfg.scopes) || /ial\/2|ial2/i.test(cfg.acrValues ?? "");
  const clearVerified = id === "clear" && (verificationStatus === undefined || verificationStatus === "success");
  const ok = claimsSayIal2 || policyAsksIal2 || clearVerified;
  return { ial: ok ? "IAL2" : "IAL1", aal: ok || claimsSayAal2 ? "AAL2" : "AAL1", evidence: `${evidence} mode=scope` };
}

export function createOidcIdentityProvider(id: IdentityProviderId): IdentityProvider {
  const cfg = readOidcConfig(id);
  return {
    id,
    displayName: id === "idme" ? "ID.me" : "CLEAR",
    mode: "live",
    async start(input: StartProofingInput): Promise<StartProofingResult> {
      const d = await discover(cfg);
      const state = randomToken(24);
      const nonce = randomToken(24);
      const { verifier, challenge } = await pkcePair();
      const u = new URL(d.authorization_endpoint);
      u.searchParams.set("response_type", "code");
      u.searchParams.set("client_id", cfg.clientId);
      u.searchParams.set("redirect_uri", cfg.redirectUri);
      u.searchParams.set("scope", cfg.scopes);
      u.searchParams.set("state", state);
      u.searchParams.set("nonce", nonce);
      u.searchParams.set("code_challenge", challenge);
      u.searchParams.set("code_challenge_method", "S256");
      if (cfg.acrValues) u.searchParams.set("acr_values", cfg.acrValues);
      return {
        redirectUrl: u.toString(),
        state,
        session: { provider: id, state, nonce, codeVerifier: verifier, caregiverId: input.caregiverId, householdId: input.householdId, returnUrl: input.returnUrl, startedAt: new Date().toISOString() },
      };
    },
    async complete({ params, session }: CompleteProofingInput): Promise<CompleteProofingResult> {
      if (params.error) return { ok: false, failureReason: `${params.error}${params.error_description ? `: ${params.error_description}` : ""}` };
      if (!params.code) return { ok: false, failureReason: "No authorization code returned." };
      if (params.state !== session.state) return { ok: false, failureReason: "State mismatch; start verification again." };
      const d = await discover(cfg);

      const body = new URLSearchParams({ grant_type: "authorization_code", code: params.code, redirect_uri: cfg.redirectUri, code_verifier: session.codeVerifier ?? "" });
      const headers: Record<string, string> = { "content-type": "application/x-www-form-urlencoded", accept: "application/json" };
      if (cfg.tokenAuth === "client_secret_basic") headers.authorization = `Basic ${btoa(`${cfg.clientId}:${cfg.clientSecret}`)}`;
      else {
        body.set("client_id", cfg.clientId);
        body.set("client_secret", cfg.clientSecret);
      }
      const tr = await fetch(d.token_endpoint, { method: "POST", headers, body, cache: "no-store" });
      if (!tr.ok) return { ok: false, failureReason: `Token exchange failed (${tr.status}).` };
      const tokens = (await tr.json()) as { id_token?: string; access_token?: string };
      if (!tokens.id_token) return { ok: false, failureReason: "Provider returned no ID token." };

      let claims: JWTPayload;
      try {
        const issuer = d.issuer || decodeJwt(tokens.id_token).iss;
        const r = await jwtVerify(tokens.id_token, jwks(d.jwks_uri), { issuer, audience: cfg.clientId, clockTolerance: 60 });
        claims = r.payload;
      } catch (e) {
        return { ok: false, failureReason: `ID token did not verify: ${(e as Error).message}` };
      }
      if (session.nonce && claims.nonce !== session.nonce) return { ok: false, failureReason: "Nonce mismatch." };
      if (!claims.sub) return { ok: false, failureReason: "ID token has no subject." };

      let attributes: Record<string, string | undefined> = {};
      if (d.userinfo_endpoint && tokens.access_token) {
        try {
          const ur = await fetch(d.userinfo_endpoint, { headers: { authorization: `Bearer ${tokens.access_token}`, accept: "application/json" }, cache: "no-store" });
          if (ur.ok) {
            const body = (await ur.text()).trim();
            // ID.me returns the userinfo payload as a signed JWT string; others return JSON.
            attributes = body.startsWith("{") ? (JSON.parse(body) as Record<string, string | undefined>) : (decodeJwt(body) as Record<string, string | undefined>);
          }
        } catch {
          /* attributes are optional */
        }
      }
      const a = assuranceFrom({ ...claims, ...attributes }, cfg, id);
      return {
        ok: true,
        identity: {
          provider: id,
          subject: `${id}|${claims.sub}`,
          assuranceLevel: a.ial,
          authenticatorLevel: a.aal,
          verifiedOn: new Date().toISOString().slice(0, 10),
          attributes: { givenName: pick(attributes, claims, "given_name", "fname"), familyName: pick(attributes, claims, "family_name", "lname"), birthDate: pick(attributes, claims, "birthdate", "birth_date") },
          evidence: a.evidence,
        },
      };
    },
  };
}

function pick(a: Record<string, unknown>, b: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = a[k] ?? b[k];
    if (typeof v === "string" && v) return v;
  }
  return undefined;
}
