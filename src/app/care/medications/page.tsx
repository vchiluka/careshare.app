import { addCaregiverMedication, connectMedicare } from "@/app/actions";
import { Field, Notice, Pill } from "@/components/ui";
import { fmtDate, sortMedications } from "@/lib/engine";
import { voice } from "@/lib/domain/care-terms";
import { requireCare } from "@/lib/services/care-context";

export const dynamic = "force-dynamic";

export default async function CareMedications({ searchParams }: PageProps<"/care/medications">) {
  const sp = await searchParams;
  const { view, me } = await requireCare({ needRecord: true });
  const { h, discrepancies } = view;
  const meds = sortMedications(h.medications);
  const srcLabel = { clinic: "Clinic list", medicare: "From Medicare claims", caregiver: "You added" } as const;
  const mine = discrepancies.filter((d) => d.kind !== "UNVERIFIED_CAREGIVER_ENTRY");
  return (
    <div>
      <h1>{h.patient.givenName}&rsquo;s medicines</h1>
      <p className="mt-2 text-ink-2">One list, shared with the clinic. If a pharmacy or another doctor changes something, add it here and the clinic will confirm it at the next contact.</p>
      {sp.welcome && (
        <div className="mt-4">
          <Notice kind="green">
            {(() => { const t = voice(h.patient.term, h.patient.givenName).their; return t.charAt(0).toUpperCase() + t.slice(1); })()} record is open. Here is what Medicare says has been filled; the clinic will confirm each one at your first contact. Nothing was typed twice.
          </Notice>
        </div>
      )}
      {sp.medicare === "ok" && <div className="mt-4"><Notice kind="green">Medicare records connected. Pharmacy fills now show next to the list.</Notice></div>}
      {(sp.medicare === "failed" || sp.medicare === "error") && <div className="mt-4"><Notice kind="amber">{sp.medicare === "error" ? "The Medicare connection could not start" : "Medicare authorization did not complete"}{sp.reason ? `: ${String(sp.reason)}` : ""}. You can try again any time.</Notice></div>}

      {mine.length > 0 && (
        <div className="card mt-6 border-amber">
          <h2>The clinic wants to check these with you</h2>
          <ul className="mt-3 space-y-3">
            {mine.map((d, i) => (
              <li key={i}>
                <div className="font-bold">{d.name}</div>
                <div className="text-ink-2">{d.detail}</div>
              </li>
            ))}
          </ul>
          <p className="text-sm text-ink-3 mt-3">Nothing to do right now except have the bottles handy for the next call.</p>
        </div>
      )}

      <ul className="mt-6 space-y-3">
        {meds.map((m) => (
          <li key={m.id} className={`card ${m.status === "stopped" ? "opacity-60" : ""}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xl font-bold capitalize">
                  {m.name} <span className="font-normal text-ink-2">{m.strength}</span>
                </div>
                <div className="text-ink-2">{m.sig}</div>
                {m.prescriber && <div className="text-sm text-ink-3">Prescribed by {m.prescriber}</div>}
              </div>
              <div className="flex flex-col items-end gap-1.5">
                {m.status === "stopped" ? <Pill>Stopped</Pill> : m.source === "caregiver" ? <Pill kind="amber">Waiting for clinic to confirm</Pill> : <Pill kind="green">{srcLabel[m.source]}</Pill>}
              </div>
            </div>
          </li>
        ))}
      </ul>

      <div className="grid md:grid-cols-2 gap-5 mt-8">
        <form action={addCaregiverMedication} className="card space-y-3">
          <h2>Add a medicine</h2>
          <Field label="Name (as on the bottle)"><input name="name" required placeholder="e.g. quetiapine" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Strength"><input name="strength" placeholder="25 mg" /></Field>
            <Field label="How often"><input name="sig" placeholder="1 at bedtime" /></Field>
          </div>
          <Field label="Who prescribed it, if you know"><input name="note" placeholder="Dr. ... at the hospital" /></Field>
          <button className="btn btn-primary">Add to the shared list</button>
        </form>
        <div className="card">
          <h2>Medicare pharmacy records</h2>
          {h.medicare.connected ? (
            <>
              <p className="mt-2 text-ink-2">Connected {fmtDate(h.medicare.connectedOn)}; last checked {fmtDate(h.medicare.lastSyncOn)}. The clinic compares what was filled against this list.</p>
              {h.medicareImport && (
                <p className="mt-1 text-sm text-ink-3">
                  Pulled {h.medicareImport.counts.coverages} coverage records, {h.medicareImport.counts.eobs} claims ({h.medicareImport.counts.pde} pharmacy, {h.medicareImport.counts.eobs - h.medicareImport.counts.pde} medical).
                </p>
              )}
              <h3 className="mt-4">Recent fills</h3>
              <ul className="mt-2 text-sm divide-y divide-rule">
                {[...h.medicareFills].sort((a, b) => b.fillOn.localeCompare(a.fillOn)).slice(0, 8).map((f, i) => (
                  <li key={i} className="py-1.5 flex justify-between gap-3">
                    <span className="capitalize">
                      {f.name} {f.strength}
                    </span>
                    <span className="text-ink-3 tnum">{fmtDate(f.fillOn)}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : me.proxy.scope.includes("medicare_records") ? (
            <>
              <p className="mt-2 text-ink-2">Connect {h.patient.givenName}&rsquo;s Medicare account so the clinic can see every prescription that was actually filled, including from doctors outside the clinic. You will be asked to sign in on Medicare.gov as {h.patient.givenName}&rsquo;s representative.</p>
              <form action={connectMedicare} className="mt-4">
                <button className="btn btn-primary">Connect Medicare records</button>
              </form>
            </>
          ) : (
            <p className="mt-2 text-ink-2">Your access does not include Medicare records. Ask the clinic.</p>
          )}
        </div>
      </div>
    </div>
  );
}
