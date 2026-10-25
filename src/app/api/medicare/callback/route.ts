import { NextResponse, type NextRequest } from "next/server";
import { getBlueButtonAdapter, type BlueButtonSession } from "@/lib/integrations/bluebutton";
import { takeFlowSession } from "@/lib/session";
import { getRepository } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Blue Button 2.0 redirect URI: register https://<host>/api/medicare/callback as BB_REDIRECT_URI. */
export async function GET(req: NextRequest) {
  const repo = getRepository();
  const base = req.nextUrl.origin;
  const session = await takeFlowSession<BlueButtonSession>("bb");
  if (!session) return NextResponse.redirect(`${base}/care/medications?medicare=error&reason=expired`);
  const adapter = getBlueButtonAdapter(async (id) => (await repo.household(id))?.medicareFills ?? []);
  const result = await adapter.complete({ params: Object.fromEntries(req.nextUrl.searchParams.entries()), session });
  const asOf = await repo.asOf();
  if (result.ok) {
    await repo.updateHousehold(session.householdId, (h) => {
      h.medicare = { connected: true, connectedOn: h.medicare.connectedOn ?? asOf, lastSyncOn: asOf, mode: adapter.mode, authorizedBy: "representative" };
      if (adapter.mode === "live") {
        h.medicareFills = result.fills ?? [];
        if (result.coverage) h.patient.coverage = { ...h.patient.coverage, partA: result.coverage.partA, partB: result.coverage.partB, partC: result.coverage.partC, partD: result.coverage.partD, medicaid: result.coverage.dualEligible ?? h.patient.coverage.medicaid };
      }
    });
  }
  await repo.audit({ actor: "system", action: result.ok ? "medicare.connected" : "medicare.failed", householdId: session.householdId, reference: result.ok ? `${adapter.mode}:${result.fills?.length ?? 0} fills` : result.failureReason });
  return NextResponse.redirect(`${base}${session.returnUrl}?medicare=${result.ok ? "ok" : "failed"}`);
}
