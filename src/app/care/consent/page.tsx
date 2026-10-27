import Link from "next/link";
import { revokeConsent, signConsent } from "@/app/actions";
import { ConsentFields } from "@/components/care-forms";
import { Notice, Pill } from "@/components/ui";
import { consentFor, consentState, fmtDate } from "@/lib/engine";
import { requireCare } from "@/lib/services/care-context";

export const dynamic = "force-dynamic";

const basisLabel = { patient: "the patient's own consent", poa_healthcare: "a health care power of attorney", legal_guardian: "a court-appointed guardianship" };

export default async function Consent({ searchParams }: PageProps<"/care/consent">) {
  const sp = await searchParams;
  const { view, me } = await requireCare();
  const { h, asOf } = view;
  const verified = me.identity.status === "verified" && me.identity.assurance === "IAL2";
  const current = consentFor(h, me.id);
  const st = consentState(current, asOf);
  const history = (h.consents ?? []).filter((c) => c.caregiverId === me.id).sort((a, b) => b.signedAt.localeCompare(a.signedAt));

  if (!verified) {
    return (
      <div className="max-w-2xl">
        <h1>Your authorization</h1>
        <Notice kind="amber">Verify your identity first; the authorization is signed by a verified person. <Link href="/care/home" className="underline">Back to home</Link>.</Notice>
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <h1>Your authorization</h1>
      {sp.error === "signature" && <Notice kind="amber">Please type your name to sign and tick the confirmation box.</Notice>}
      <div className="card mt-4">
        <div className="flex items-center justify-between gap-4">
          <h2>Status</h2>
          {st.state === "active" && <Pill kind="green">Active, {st.daysLeft} days left</Pill>}
          {st.state === "expiring" && <Pill kind="amber">Lapses in {st.daysLeft} day{st.daysLeft === 1 ? "" : "s"}</Pill>}
          {st.state === "expired" && <Pill kind="red">Lapsed</Pill>}
          {st.state === "revoked" && <Pill kind="red">Revoked</Pill>}
          {st.state === "none" && <Pill>Not signed</Pill>}
        </div>
        {current ? (
          <p className="mt-2 text-ink-2 text-sm">
            Signed {fmtDate(current.signedAt.slice(0, 10))} on the basis of {basisLabel[current.basis]}, form v{current.version}. Valid to {fmtDate(current.expiresOn)}.
            {current.shareWith.directoryPartner ? " Directory feedback on." : " Directory feedback off."}
            {current.shareWith.evaluator ? " Evaluation sharing on." : " Evaluation sharing off."}
          </p>
        ) : (
          <p className="mt-2 text-ink-2 text-sm">You have not signed the authorization for {h.patient.givenName}&rsquo;s record yet. Until you do, you can use your own check-ins but not the record.</p>
        )}
        {(st.state === "active" || st.state === "expiring") && (
          <form action={revokeConsent} className="mt-4">
            <button className="btn btn-danger">Revoke my authorization</button>
            <span className="text-xs text-ink-3 ml-3">Immediate. The clinic is told. You can sign again later.</span>
          </form>
        )}
      </div>

      <form action={signConsent}>
        <h2 className="mt-8">{current && st.state !== "revoked" ? "Re-affirm for another 90 days" : "Sign the authorization"}</h2>
        <ConsentFields patientName={`${h.patient.givenName} ${h.patient.familyName}`} signerName={`${me.givenName} ${me.familyName}`} previous={current} />
        <button className="btn btn-primary btn-lg w-full mt-6">Sign</button>
      </form>

      {history.length > 1 && (
        <div className="mt-8">
          <h2>History</h2>
          <ul className="mt-3 text-sm text-ink-2 space-y-1">
            {history.map((c) => (
              <li key={c.id}>
                {fmtDate(c.signedAt.slice(0, 10))}: {c.status}, {basisLabel[c.basis]}, to {fmtDate(c.expiresOn)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
