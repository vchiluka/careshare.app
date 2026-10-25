import { NextResponse, type NextRequest } from "next/server";
import { getIdentityProvider, type ProofingSession } from "@/lib/integrations/identity";
import { takeFlowSession } from "@/lib/session";
import { getRepository } from "@/lib/store";
import { computeSignals } from "@/lib/engine";

export const dynamic = "force-dynamic";

/**
 * OIDC redirect URI for both vendors and the mock:
 *   /api/identity/callback/idme   /api/identity/callback/clear
 * Register the full URL (https://<host>/api/identity/callback/<provider>) with the vendor and set
 * it as IDME_REDIRECT_URI / CLEAR_REDIRECT_URI.
 */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/identity/callback/[provider]">) {
  const { provider } = await ctx.params;
  const id = provider === "clear" ? "clear" : provider === "idme" ? "idme" : null;
  const repo = getRepository();
  const base = req.nextUrl.origin;
  if (!id) return NextResponse.redirect(`${base}/care/home?verify=error&reason=unknown_provider`);

  const session = await takeFlowSession<ProofingSession>("proof");
  if (!session || session.provider !== id) return NextResponse.redirect(`${base}/care/home?verify=error&reason=expired`);

  const params = Object.fromEntries(req.nextUrl.searchParams.entries());
  const result = await getIdentityProvider(id).complete({ params, session });
  const asOf = await repo.asOf();

  await repo.updateHousehold(session.householdId, (h) => {
    const cg = h.caregivers.find((c) => c.id === session.caregiverId);
    if (!cg) return;
    if (result.ok && result.identity) {
      const ial2 = result.identity.assuranceLevel === "IAL2";
      cg.identity = {
        status: ial2 ? "verified" : "failed",
        provider: id,
        assurance: result.identity.assuranceLevel,
        authenticator: result.identity.authenticatorLevel,
        verifiedOn: ial2 ? asOf : undefined,
        subject: result.identity.subject,
        failureReason: ial2 ? undefined : "The vendor verified the account at IAL1 only; IAL2 is required to see the record.",
        attempts: cg.identity.attempts,
      };
      if (ial2 && cg.proxy.status === "not_requested") {
        cg.proxy.status = "requested";
        cg.proxy.requestedOn = asOf;
      }
      h.escalations = h.escalations.filter((e) => e.rule !== "IDENTITY_NOT_VERIFIED");
    } else {
      cg.identity.status = cg.identity.attempts >= 2 ? "in_person_pending" : "failed";
      cg.identity.failureReason = result.failureReason;
    }
    const keys = new Set(h.escalations.map((e) => e.key));
    for (const s of computeSignals(h, asOf)) if (s.severity !== "info" && !keys.has(s.key)) h.escalations.unshift({ ...s, id: `esc_${Date.now().toString(36)}`, raisedOn: asOf, status: "open" });
  });

  await repo.audit({
    actor: `caregiver:${session.caregiverId}`,
    action: result.ok ? "identity.verified" : "identity.failed",
    householdId: session.householdId,
    reference: result.identity?.subject ?? id,
    detail: result.ok ? `${result.identity!.assuranceLevel}/${result.identity!.authenticatorLevel}; ${result.identity!.evidence}` : result.failureReason,
  });

  const q = result.ok ? "verify=ok" : `verify=failed&reason=${encodeURIComponent(result.failureReason ?? "unknown")}`;
  return NextResponse.redirect(`${base}${session.returnUrl}?${q}`);
}
