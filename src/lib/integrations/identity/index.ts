import type { IdentityProvider, IdentityProviderId } from "./types";
import { createMockIdentityProvider } from "./mock";
import { createOidcIdentityProvider } from "./oidc";

export type * from "./types";

/**
 * IDENTITY_IDME=mock|live and IDENTITY_CLEAR=mock|live select the implementation per vendor.
 * Live providers read their configuration from IDME_* / CLEAR_* environment variables (oidc.ts).
 */
export function identityMode(id: IdentityProviderId): "mock" | "live" {
  const v = (id === "idme" ? process.env.IDENTITY_IDME : process.env.IDENTITY_CLEAR) ?? "mock";
  if (v !== "mock" && v !== "live") throw new Error(`IDENTITY_${id.toUpperCase()} must be mock or live, got "${v}".`);
  return v;
}

export function getIdentityProvider(id: IdentityProviderId): IdentityProvider {
  return identityMode(id) === "live" ? createOidcIdentityProvider(id) : createMockIdentityProvider(id);
}

export function identityProviders(): IdentityProvider[] {
  return (["clear", "idme"] as const).map(getIdentityProvider);
}

export interface ProviderStatus {
  id: IdentityProviderId;
  displayName: string;
  mode: "mock" | "live";
  /** Set when the live configuration is incomplete; names variables only, never values. */
  configError?: string;
}

/** Never throws: a misconfigured vendor is reported, not fatal, so the page still renders. */
export function describeIdentityProviders(): ProviderStatus[] {
  return (["clear", "idme"] as const).map((id) => {
    const displayName = id === "idme" ? "ID.me" : "CLEAR";
    try {
      const p = getIdentityProvider(id);
      return { id, displayName, mode: p.mode };
    } catch (e) {
      return { id, displayName, mode: "live", configError: (e as Error).message };
    }
  });
}
