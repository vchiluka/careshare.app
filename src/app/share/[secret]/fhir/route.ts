import { NextResponse, type NextRequest } from "next/server";
import { exportHouseholdBundle } from "@/lib/integrations/fhir/export";
import { findShare } from "@/lib/services/share";
import { getRepository } from "@/lib/store";

export const dynamic = "force-dynamic";

/** FHIR R4 Bundle behind a share link; requires the PIN. */
export async function GET(req: NextRequest, ctx: RouteContext<"/share/[secret]/fhir">) {
  const { secret } = await ctx.params;
  const pin = req.nextUrl.searchParams.get("pin") ?? undefined;
  const repo = getRepository();
  const res = await findShare(await repo.households(), secret, pin ?? "");
  if (!res.ok) return NextResponse.json({ resourceType: "OperationOutcome", issue: [{ severity: "error", code: "forbidden", diagnostics: res.reason }] }, { status: res.reason === "bad_pin" ? 403 : 404 });
  const sites = await repo.sites();
  const bundle = exportHouseholdBundle(res.h, { asOf: await repo.asOf(), caregiverId: res.link.createdBy, baseUrl: `${req.nextUrl.origin}/fhir`, siteName: sites.find((s) => s.id === res.h.siteId)?.orgName });
  await repo.audit({ actor: "share:viewer", action: "share.fhir_downloaded", householdId: res.h.id, reference: res.link.id });
  return new NextResponse(JSON.stringify(bundle, null, 1), { headers: { "content-type": "application/fhir+json", "content-disposition": `attachment; filename="careshare-${res.h.patient.familyName.toLowerCase()}-${Date.now()}.json"` } });
}
