import Link from "next/link";
import { confirmProxy } from "@/app/actions";
import { Pill, Section } from "@/components/ui";
import { fmtDate } from "@/lib/engine";
import { requireClinic } from "@/lib/services/clinic-context";
import { loadRoster } from "@/lib/services/household-view";

export const dynamic = "force-dynamic";

export default async function ProxyQueue() {
  await requireClinic();
  const { rows } = await loadRoster();
  const all = rows.flatMap((r) => r.h.caregivers.map((c) => ({ r, c })));
  const toConfirm = all.filter(({ c }) => c.identity.status === "verified" && c.proxy.status === "requested");
  const verifiedNotRequested = all.filter(({ c }) => c.identity.status === "verified" && c.proxy.status === "not_requested");
  const needVerification = all.filter(({ c }) => c.identity.status !== "verified");
  return (
    <div>
      <h1>Proxy confirmations</h1>
      <p className="mt-1 text-ink-2 max-w-3xl">
        A caregiver sees nothing from the record until two things are true: her identity is verified at IAL2 (CLEAR, ID.me, or in person), and the clinic has confirmed her once as the patient&rsquo;s representative with the consent basis recorded. Both steps are audited. There is no way around either.
      </p>

      <Section title="Verified, waiting for you" aside={<span className="text-sm text-ink-3">{toConfirm.length}</span>}>
        {toConfirm.length === 0 ? (
          <p className="text-sm text-ink-3">Queue is empty.</p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Caregiver</th>
                <th>For</th>
                <th>Verified</th>
                <th>Requested</th>
                <th>Consent basis</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {toConfirm.map(({ r, c }) => (
                <tr key={c.id}>
                  <td className="font-semibold">
                    {c.givenName} {c.familyName}
                    <div className="text-xs text-ink-3 font-normal">{c.relationship.replaceAll("_", " ")} · {c.phone}</div>
                  </td>
                  <td>
                    <Link href={`/clinic/households/${r.h.id}?tab=caregiver`} className="underline">
                      {r.h.patient.givenName} {r.h.patient.familyName}
                    </Link>
                    <div className="text-xs text-ink-3">{r.localityName}</div>
                  </td>
                  <td>
                    <Pill kind="green">{c.identity.provider === "in_person" ? "in person" : c.identity.provider}</Pill>
                    <div className="text-xs text-ink-3">{fmtDate(c.identity.verifiedOn)}</div>
                  </td>
                  <td className="tnum">{fmtDate(c.proxy.requestedOn)}</td>
                  <td colSpan={2}>
                    <form action={confirmProxy} className="flex gap-2 items-center">
                      <input type="hidden" name="householdId" value={r.h.id} />
                      <input type="hidden" name="caregiverId" value={c.id} />
                      <select name="basis" className="input py-1">
                        <option value="patient">Patient consented</option>
                        <option value="poa_healthcare">Health care POA on file</option>
                        <option value="legal_guardian">Guardian</option>
                      </select>
                      <button className="btn btn-primary py-1">Confirm</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section title="Verified, not yet requested" aside={<span className="text-sm text-ink-3">{verifiedNotRequested.length}</span>}>
        <ul className="text-sm divide-y divide-rule">
          {verifiedNotRequested.map(({ r, c }) => (
            <li key={c.id} className="py-2">
              {c.givenName} {c.familyName} for{" "}
              <Link href={`/clinic/households/${r.h.id}?tab=caregiver`} className="underline">
                {r.h.patient.givenName} {r.h.patient.familyName}
              </Link>{" "}
              <span className="text-ink-3">— you can confirm from the household page once consent is in hand.</span>
            </li>
          ))}
          {verifiedNotRequested.length === 0 && <li className="py-2 text-ink-3">None.</li>}
        </ul>
      </Section>

      <Section title="Not yet verified" aside={<span className="text-sm text-ink-3">{needVerification.length}</span>}>
        <table className="data">
          <thead>
            <tr>
              <th>Caregiver</th>
              <th>For</th>
              <th>Status</th>
              <th>Attempts</th>
              <th>Reaches us by</th>
              <th>Next</th>
            </tr>
          </thead>
          <tbody>
            {needVerification.map(({ r, c }) => (
              <tr key={c.id}>
                <td className="font-semibold">
                  {c.givenName} {c.familyName}
                </td>
                <td>
                  <Link href={`/clinic/households/${r.h.id}?tab=caregiver`} className="underline">
                    {r.h.patient.givenName} {r.h.patient.familyName}
                  </Link>
                </td>
                <td>
                  <Pill kind={c.identity.status === "failed" || c.identity.status === "in_person_pending" ? "amber" : "neutral"}>{c.identity.status.replaceAll("_", " ")}</Pill>
                </td>
                <td className="tnum">{c.identity.attempts}</td>
                <td className="text-ink-2">
                  {c.access.preferredChannel}
                  {!c.access.smartphone ? ", no smartphone" : ""}
                  {c.access.broadband !== "ok" ? `, ${c.access.broadband === "low" ? "poor" : "no"} connection` : ""}
                </td>
                <td className="text-ink-2 text-xs">{c.identity.status === "in_person_pending" || c.identity.status === "failed" ? "Schedule in-person verification with the enrollment coordinator." : c.access.smartphone ? "Text the link again; offer a phone walk-through." : "In-person verification at the next visit; no smartphone."}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </div>
  );
}
