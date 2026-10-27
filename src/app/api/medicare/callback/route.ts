import { NextResponse, type NextRequest } from "next/server";
import { coverageSummary, diagnosesFromImport, fillsFromImport, getBlueButtonAdapter, type BlueButtonSession } from "@/lib/integrations/bluebutton";
import { takeFlowSession } from "@/lib/session";
import { getRepository } from "@/lib/store";
import { applyMedicareImport } from "@/lib/services/medicare-apply";

export const dynamic = "force-dynamic";

/** Blue Button 2.0 redirect URI: register https://<host>/api/medicare/callback as BB_REDIRECT_URI. */
export async function GET(req: NextRequest) {
  const repo = getRepository();
  const base = req.nextUrl.origin;
  const session = await takeFlowSession<BlueButtonSession>("bb");
  if (!session) return NextResponse.redirect(`${base}/care/medications?medicare=error&reason=expired`);
  const adapter = getBlueButtonAdapter((id) => repo.household(id), () => repo.asOf());
  const result = await adapter.complete({ params: Object.fromEntries(req.nextUrl.searchParams.entries()), session });
  const asOf = await repo.asOf();
  if (result.ok && result.import) {
    const imp = result.import;
    await repo.updateHousehold(session.householdId, (h) => applyMedicareImport(h, imp, { asOf, mode: adapter.mode, patientRef: result.patientRef }));
    const cov = coverageSummary(imp);
    await repo.audit({
      actor: "system",
      action: "medicare.connected",
      householdId: session.householdId,
      reference: `${adapter.mode}:${imp.counts.eobs} claims (${imp.counts.pde} pde), ${imp.counts.coverages} coverages`,
      detail: `A=${cov.partA} B=${cov.partB} C=${cov.partC} D=${cov.partD} dual=${cov.dual}; ${diagnosesFromImport(imp).length} dx codes; ${fillsFromImport(imp).length} fills`,
    });
  } else {
    await repo.audit({ actor: "system", action: "medicare.failed", householdId: session.householdId, reference: result.failureReason });
  }
  return NextResponse.redirect(`${base}${session.returnUrl}?medicare=${result.ok ? "ok" : "failed"}`);
}
