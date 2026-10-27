import { NextResponse, type NextRequest } from "next/server";
import type { CaregiverIdentity, StaffUser } from "@/lib/domain/types";
import { computeSignals } from "@/lib/engine";
import { getIdentityProvider, type ProofingSession, type VerifiedIdentity } from "@/lib/integrations/identity";
import { setCaregiverSession, setStaffSession, takeFlowSession } from "@/lib/session";
import { getRepository } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * OIDC redirect URI for both vendors and the mock:
 *   /api/identity/callback/idme   /api/identity/callback/clear
 * Serves three subjects: a caregiver on a clinic-enrolled household, a self-registered caregiver
 * account, and clinic staff signing in through a CSP.
 */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/identity/callback/[provider]">) {
  const { provider } = await ctx.params;
  const id = provider === "clear" ? "clear" : provider === "idme" ? "idme" : null;
  const repo = getRepository();
  const base = req.nextUrl.origin;
  if (!id) return NextResponse.redirect(`${base}/care?verify=error&reason=unknown_provider`);

  const session = await takeFlowSession<ProofingSession>("proof");
  if (!session || session.provider !== id) return NextResponse.redirect(`${base}/care?verify=error&reason=expired`);

  const params = Object.fromEntries(req.nextUrl.searchParams.entries());
  const result = await getIdentityProvider(id).complete({ params, session });
  const asOf = await repo.asOf();
  const ial2 = !!(result.ok && result.identity && result.identity.assuranceLevel === "IAL2");
  const subj = session.subject;
  const fail = (q: string) => NextResponse.redirect(`${base}${session.returnUrl}?${q}`);

  const toIdentity = (prev: CaregiverIdentity, idn: VerifiedIdentity | undefined): CaregiverIdentity =>
    result.ok && idn
      ? { status: ial2 ? "verified" : "failed", provider: id, assurance: idn.assuranceLevel, authenticator: idn.authenticatorLevel, verifiedOn: ial2 ? asOf : undefined, subject: idn.subject, failureReason: ial2 ? undefined : "The vendor verified the account at IAL1 only; IAL2 is required.", attempts: prev.attempts }
      : { ...prev, status: prev.attempts >= 2 ? "in_person_pending" : "failed", failureReason: result.failureReason };

  if (subj.kind === "caregiver") {
    await repo.updateHousehold(subj.householdId, (h) => {
      const cg = h.caregivers.find((c) => c.id === subj.caregiverId);
      if (!cg) return;
      cg.identity = toIdentity(cg.identity, result.identity);
      if (ial2 && cg.proxy.status === "not_requested") {
        cg.proxy.status = "requested";
        cg.proxy.requestedOn = asOf;
      }
      if (ial2) h.escalations = h.escalations.filter((e) => e.rule !== "IDENTITY_NOT_VERIFIED");
      const keys = new Set(h.escalations.map((e) => e.key));
      for (const s of computeSignals(h, asOf)) if (s.severity !== "info" && !keys.has(s.key)) h.escalations.unshift({ ...s, id: `esc_${Date.now().toString(36)}`, raisedOn: asOf, status: "open" });
    });
    await repo.audit({ actor: `caregiver:${subj.caregiverId}`, action: result.ok ? "identity.verified" : "identity.failed", householdId: subj.householdId, reference: result.identity?.subject ?? id, detail: result.ok ? `${result.identity!.assuranceLevel}/${result.identity!.authenticatorLevel}; ${result.identity!.evidence}` : result.failureReason });
    return fail(result.ok ? "verify=ok" : `verify=failed&reason=${encodeURIComponent(result.failureReason ?? "unknown")}`);
  }

  if (subj.kind === "account") {
    const acct = await repo.account(subj.accountId);
    if (!acct) return fail("verify=error&reason=account_missing");
    acct.identity = toIdentity(acct.identity, result.identity);
    // Registration: take name and date of birth from the verified attributes once, if the vendor released them.
    if (ial2 && result.identity && !acct.givenName) {
      const at = result.identity.attributes;
      if (at.givenName) acct.givenName = at.givenName;
      if (at.familyName) acct.familyName = at.familyName;
      if (at.birthDate && /^\d{4}-\d{2}-\d{2}$/.test(at.birthDate)) acct.birthDate = at.birthDate;
    }
    await repo.upsertAccount(acct);
    // Mirror onto any household caregiver entries linked to the account.
    for (const hid of acct.householdIds) {
      await repo.updateHousehold(hid, (h) => {
        const cg = h.caregivers.find((c) => c.accountId === acct.id);
        if (cg) cg.identity = acct.identity;
      });
    }
    await repo.audit({ actor: `account:${acct.id}`, action: result.ok ? "identity.verified" : "identity.failed", reference: result.identity?.subject ?? id, detail: result.ok ? `${result.identity!.assuranceLevel}/${result.identity!.authenticatorLevel}; ${result.identity!.evidence}` : result.failureReason });
    await setCaregiverSession({ accountId: acct.id });
    return fail(result.ok ? "verify=ok" : `verify=failed&reason=${encodeURIComponent(result.failureReason ?? "unknown")}`);
  }

  // Staff: find or create a pending staff record keyed by the CSP subject; an admin approves and assigns a role.
  if (!result.ok || !result.identity) {
    await repo.audit({ actor: "staff:unknown", action: "identity.failed", reference: id, detail: result.failureReason });
    return fail(`verify=failed&reason=${encodeURIComponent(result.failureReason ?? "unknown")}`);
  }
  const staff = await repo.staff();
  let me = staff.find((s) => s.identity?.subject === result.identity!.subject);
  if (!me) {
    const name = [result.identity.attributes.givenName, result.identity.attributes.familyName].filter(Boolean).join(" ") || subj.name || "New staff member";
    me = { id: `st_${Date.now().toString(36)}`, name, role: "ma", siteId: (await repo.sites())[0].id, status: "pending", email: subj.email, identity: { provider: id, subject: result.identity.subject, assurance: result.identity.assuranceLevel, verifiedOn: asOf } } satisfies StaffUser;
    await repo.upsertStaff(me);
    await repo.audit({ actor: `staff:${me.id}`, action: "staff.registered_pending", reference: result.identity.subject, detail: `${result.identity.assuranceLevel}; ${result.identity.evidence}` });
  } else {
    me.identity = { provider: id, subject: result.identity.subject, assurance: result.identity.assuranceLevel, verifiedOn: asOf };
    await repo.upsertStaff(me);
    await repo.audit({ actor: `staff:${me.id}`, action: "staff.sign_in_csp", reference: result.identity.subject });
  }
  await setStaffSession({ staffId: me.id });
  return NextResponse.redirect(`${base}${me.status === "active" ? "/clinic" : "/clinic/pending"}`);
}
