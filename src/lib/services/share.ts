import type { Household, ShareLink } from "@/lib/domain/types";
import { randomToken, sha256base64url } from "@/lib/integrations/crypto";

export const SHARE_VALID_HOURS = 72;

/** Create a share link. Returns the secret and PIN once; only their hashes are stored. */
export async function newShareLink(input: { id: string; caregiverId: string; label: string; now: Date }): Promise<{ link: ShareLink; secret: string; pin: string }> {
  const secret = randomToken(24);
  const pin = String(Math.floor(100000 + Math.random() * 900000));
  const link: ShareLink = {
    id: input.id,
    tokenHash: await sha256base64url(secret),
    pinHash: await sha256base64url(pin),
    label: input.label.slice(0, 80),
    createdBy: input.caregiverId,
    createdAt: input.now.toISOString(),
    expiresAt: new Date(input.now.getTime() + SHARE_VALID_HOURS * 3600 * 1000).toISOString(),
    opens: 0,
  };
  return { link, secret, pin };
}

export type ShareLookup = { ok: true; h: Household; link: ShareLink } | { ok: false; reason: "not_found" | "expired" | "revoked" | "bad_pin" };

/** Resolve a secret (and optionally a PIN) across households. Constant-time enough for a 24-byte secret. */
export async function findShare(households: Household[], secret: string, pin?: string, now = new Date()): Promise<ShareLookup> {
  const hash = await sha256base64url(secret);
  for (const h of households) {
    const link = (h.shares ?? []).find((s) => s.tokenHash === hash);
    if (!link) continue;
    if (link.revokedAt) return { ok: false, reason: "revoked" };
    if (Date.parse(link.expiresAt) < now.getTime()) return { ok: false, reason: "expired" };
    if (pin !== undefined && (await sha256base64url(pin)) !== link.pinHash) return { ok: false, reason: "bad_pin" };
    return { ok: true, h, link };
  }
  return { ok: false, reason: "not_found" };
}

/**
 * SMART Health Link payload for the QR code: the viewer URL, a label, expiry, and the P flag meaning a PIN
 * is required. Scanners that understand shlink:/ open the viewer; everyone else reads the plain URL.
 */
export function shlinkUri(viewerUrl: string, label: string, expiresAt: string): string {
  const payload = { url: viewerUrl, flag: "P", label: label.slice(0, 80), exp: Math.floor(Date.parse(expiresAt) / 1000), v: 1 };
  return `shlink:/${Buffer.from(JSON.stringify(payload)).toString("base64url")}`;
}
