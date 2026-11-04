/**
 * The tenant a request runs as.
 *
 * WP1: one tenant, "demo", which every synthetic record belongs to. WP5 replaces the body of
 * currentTenantId() with a read from the signed session (staff) or from the household's tenant
 * (caregiver), and nothing else in the codebase changes, because every store call already goes
 * through this function.
 */

export const DEMO_TENANT_ID = "demo";

export function currentTenantId(): string {
  return DEMO_TENANT_ID;
}
