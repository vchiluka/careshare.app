/**
 * Small crypto helpers shared by the integration adapters and the session cookie.
 * Web Crypto only, so this runs in the Node runtime and the Edge runtime alike.
 */

const enc = new TextEncoder();

export function randomToken(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return base64url(buf);
}

export function base64url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export function fromBase64url(s: string): Uint8Array<ArrayBuffer> {
  const b = atob(s.replaceAll("-", "+").replaceAll("_", "/") + "===".slice((s.length + 3) % 4));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}

export async function sha256base64url(input: string): Promise<string> {
  return base64url(await crypto.subtle.digest("SHA-256", enc.encode(input)));
}

/** PKCE: verifier (43-128 chars) and S256 challenge. */
export async function pkcePair(): Promise<{ verifier: string; challenge: string }> {
  const verifier = randomToken(48);
  return { verifier, challenge: await sha256base64url(verifier) };
}

function secret(): string {
  const s = process.env.CARESHARE_SECRET;
  if (s && s.length >= 16) return s;
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEV_SECRET !== "1") {
    throw new Error("CARESHARE_SECRET (16+ chars) must be set in production; it signs the verification session cookie.");
  }
  return "careshare-dev-secret-not-for-production";
}

async function hmacKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", enc.encode(secret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

/** Sign a JSON payload into a compact token: base64url(json).base64url(hmac). */
export async function signPayload(payload: unknown): Promise<string> {
  const body = base64url(enc.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(), enc.encode(body));
  return `${body}.${base64url(sig)}`;
}

export async function verifyPayload<T>(token: string | undefined, maxAgeMs = 30 * 60 * 1000): Promise<T | null> {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const ok = await crypto.subtle.verify("HMAC", await hmacKey(), fromBase64url(sig), enc.encode(body));
  if (!ok) return null;
  try {
    const obj = JSON.parse(new TextDecoder().decode(fromBase64url(body))) as T & { startedAt?: string };
    if (obj.startedAt && Date.now() - Date.parse(obj.startedAt) > maxAgeMs) return null;
    return obj;
  } catch {
    return null;
  }
}
