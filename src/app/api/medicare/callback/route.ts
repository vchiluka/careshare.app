import { NextResponse, type NextRequest } from "next/server";
import { coverageSummary, diagnosesFromImport, fillsFromImport, getBlueButtonAdapter, type BlueButtonSession } from "@/lib/integrations/bluebutton";
import { takeFlowSession } from "@/lib/session";
import { getRepository } from "@/lib/store";
import { applyMedicareImport } from "@/lib/services/medicare-apply";

export const dynamic = "force-dynamic";

/**
 * Blue Button 2.0 redirect URI: register https://<host>/api/medicare/callback as BB_REDIRECT_URI.
 * Two subjects: an existing household (import applied immediately) and a caregiver account adding a
 * patient (import parked on the draft until she confirms it is the right person).
 */
export async function GET(req: NextRequest) {
  const repo = getRepository();
  const base = req.nextUrl.origin;
  const session = await takeFlowSession<BlueButtonSession>("bb");
  if (!session) return NextResponse.redirect(`${base}/care/home?medicare=error&reason=expired`);
  const adapter = getBlueButtonAdapter({ household: (id) => repo.household(id), account: (id) => repo.account(id), asOf: () => repo.asOf() });
  const result = await adapter.complete({ params: Object.fromEntries(req.nextUrl.searchParams.entries()), session });
  const asOf = await repo.asOf();
  const subj = session.subject;
  const householdId = subj.kind === "household" ? subj.householdId : undefined;
  const actor = subj.kind === "household" ? "system" : `account:${subj.accountId}`;
  const summary = (imp: NonNullable<typeof result.import>) => {
    const cov = coverageSummary(imp);
    return {
      reference: `${adapter.mode}:${imp.counts.eobs} claims (${imp.counts.pde} pde), ${imp.counts.coverages} coverages`,
      detail: `A=${cov.partA} B=${cov.partB} C=${cov.partC} D=${cov.partD} dual=${cov.dual}; ${diagnosesFromImport(imp).length} dx codes; ${fillsFromImport(imp).length} fills`,
    };
  };

  if (result.ok && result.import) {
    const imp = result.import;
    if (subj.kind === "household") {
      await repo.updateHousehold(subj.householdId, (h) => applyMedicareImport(h, imp, { asOf, mode: adapter.mode, patientRef: result.patientRef }));
      await repo.audit({ actor, action: "medicare.connected", householdId, ...summary(imp) });
    } else {
      const a = await repo.account(subj.accountId);
      if (!a) return NextResponse.redirect(`${base}/care?verify=error&reason=account_missing`);
      a.pending = { ...(a.pending ?? { startedAt: new Date().toISOString() }), import: imp };
      await repo.upsertAccount(a);
      await repo.audit({ actor, action: "medicare.pulled_for_draft", ...summary(imp) });
    }
  } else {
    await repo.audit({ actor, action: "medicare.failed", householdId, reference: result.failureReason });
  }
  return NextResponse.redirect(`${base}${session.returnUrl}${session.returnUrl.includes("?") ? "&" : "?"}medicare=${result.ok ? "ok" : "failed"}${result.ok ? "" : `&reason=${encodeURIComponent(result.failureReason ?? "")}`}`);
}
