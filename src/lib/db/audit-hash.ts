/**
 * Hash chain for audit.events. Pure functions shared by the store, the seed script and the verifier.
 *
 * hash = sha256(prev_hash + "\n" + canonical(row)). The first event of a tenant chains from "genesis".
 * A row that is altered, or removed from the middle, makes every later hash fail to recompute.
 */

import { createHash } from "node:crypto";

export interface AuditRowForHash {
  at: string; // ISO timestamp exactly as stored
  tenantId: string;
  actor: string;
  action: string;
  householdId?: string | null;
  reference?: string | null;
  detail?: string | null;
}

export const GENESIS = "genesis";

export function auditHash(prevHash: string, row: AuditRowForHash): string {
  const canonical = JSON.stringify([row.at, row.tenantId, row.actor, row.action, row.householdId ?? null, row.reference ?? null, row.detail ?? null]);
  return createHash("sha256").update(prevHash).update("\n").update(canonical).digest("hex");
}

export interface ChainCheck {
  ok: boolean;
  checked: number;
  /** id of the first row whose hash or prev_hash does not match, if any */
  brokenAt?: string;
}

/** Walk rows in id order (oldest first) for one tenant. */
export function verifyChain(rows: Array<AuditRowForHash & { id: string; prevHash: string; hash: string }>): ChainCheck {
  let prev = GENESIS;
  for (const r of rows) {
    if (r.prevHash !== prev || auditHash(prev, r) !== r.hash) return { ok: false, checked: rows.length, brokenAt: r.id };
    prev = r.hash;
  }
  return { ok: true, checked: rows.length };
}
