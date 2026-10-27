import Link from "next/link";
import { connectMedicare } from "@/app/actions";
import { Notice, Pill } from "@/components/ui";
import { describeBlueButton } from "@/lib/integrations/bluebutton";
import { requireCare } from "@/lib/services/care-context";

export const dynamic = "force-dynamic";

/** Step 4 of self-service setup: hand off to Medicare.gov (Blue Button 2.0, OAuth 2.0 + PKCE) and come back with the record filled in. */
export default async function Connect({ searchParams }: PageProps<"/care/connect">) {
  const sp = await searchParams;
  const { view, me } = await requireCare({ needRecord: true });
  const { h } = view;
  const bb = describeBlueButton();
  const mode = bb.mode;
  const canConnect = me.proxy.scope.includes("medicare_records") && !bb.configError;
  const denied = sp.medicare === "denied" || sp.medicare === "failed" || sp.medicare === "error";
  return (
    <div className="max-w-xl">
      <ol className="flex flex-wrap gap-2 text-xs">
        {["Verify who you are", "About you", "Add the person you care for", "Connect Medicare"].map((label, i) => (
          <li key={label}>
            <Pill kind={i < 3 ? "green" : "accent"}>
              {i + 1}. {label}
            </Pill>
          </li>
        ))}
      </ol>
      {sp.signed && <Notice kind="green">Signed. {h.patient.givenName}&rsquo;s record is open to you.</Notice>}
      {denied && <Notice kind="amber">{sp.medicare === "error" ? "The Medicare connection could not start" : "Medicare.gov did not complete the authorization"}{sp.reason ? `: ${String(sp.reason)}` : ""}. You can try again or skip for now.</Notice>}
      {bb.configError && <Notice kind="amber">Medicare connection is not available right now. Configuration incomplete: {bb.configError}</Notice>}
      <h1 className="mt-4">Connect {h.patient.givenName}&rsquo;s Medicare records</h1>
      <p className="mt-2 text-ink-2">
        You will be sent to Medicare.gov to sign in as {h.patient.givenName} or as their representative and allow CareShare to read their records. Then you come straight back here. We pull three things: what Medicare covers (Parts A, B, D and Medicaid status), every prescription filled under Part D, and recent doctor, hospital and emergency visits. The clinic starts with facts instead of a blank chart.
      </p>
      {h.medicare.connected ? (
        <div className="card mt-6">
          <Pill kind="green">Connected</Pill>
          <p className="mt-2 text-ink-2">
            {h.medicareImport ? `${h.medicareImport.counts.coverages} coverage records, ${h.medicareImport.counts.pde} prescription fills, ${h.medicareImport.counts.eobs - h.medicareImport.counts.pde} medical claims.` : `${h.medicareFills.length} prescription fills.`}
          </p>
          <div className="flex gap-3 mt-4">
            <Link href="/care/medications" className="btn btn-primary">
              See the medicine list
            </Link>
            <Link href="/care/home" className="btn btn-secondary">
              Home
            </Link>
          </div>
        </div>
      ) : canConnect ? (
        <form action={connectMedicare} className="card mt-6">
          <button className="btn btn-primary btn-lg w-full">Go to Medicare.gov and connect</button>
          <p className="text-xs text-ink-3 mt-3">
            {mode === "mock" ? "Demo mode: a stand-in page plays Medicare.gov and returns synthetic claims in the real Blue Button 2.0 format." : "Live Blue Button 2.0 sandbox. Use a sandbox beneficiary login provided by CMS."} We never see the Medicare.gov password, and the access token is discarded after the pull.
          </p>
        </form>
      ) : (
        <Notice kind="amber">Your access does not include Medicare records. Ask the clinic.</Notice>
      )}
      {!h.medicare.connected && (
        <p className="mt-4 text-sm">
          <Link href="/care/home" className="underline">
            Skip for now
          </Link>{" "}
          <span className="text-ink-3">(you can connect later from Home or Medicines)</span>
        </p>
      )}
    </div>
  );
}
