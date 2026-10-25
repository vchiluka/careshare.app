import { addClinicMedication, addFillFromClaims, completeReconciliation, updateMedication } from "@/app/actions";
import { Field, Notice, Pill, Section } from "@/components/ui";
import { fmtDate, reconciliationIsCurrent, sortMedications } from "@/lib/engine";
import type { HouseholdView } from "@/lib/services/household-view";

export function MedicationsTab({ view }: { view: HouseholdView }) {
  const { h, asOf, discrepancies } = view;
  const meds = sortMedications(h.medications);
  const current = reconciliationIsCurrent(h.medReconciliationCompletedOn, asOf, 90);
  const fills = [...h.medicareFills].sort((a, b) => b.fillOn.localeCompare(a.fillOn));
  return (
    <div className="grid lg:grid-cols-[1.3fr_1fr] gap-8">
      <div>
        <Section title="Reconciliation" aside={current ? <Pill kind="green">current · {fmtDate(h.medReconciliationCompletedOn)}</Pill> : <Pill kind="amber">{h.medReconciliationCompletedOn ? `last ${fmtDate(h.medReconciliationCompletedOn)}` : "never"}</Pill>}>
          {!h.medicare.connected && <Notice kind="blue">Medicare records are not connected for this household, so only the caregiver&rsquo;s report can catch outside prescriptions. Ask the caregiver to connect them from her app.</Notice>}
          {discrepancies.length === 0 ? (
            <p className="text-sm text-ink-3 mt-3">The clinic list, Medicare pharmacy claims and the caregiver&rsquo;s entries agree.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {discrepancies.map((d, i) => (
                <li key={i} className="card py-3">
                  <div className="flex items-center gap-2">
                    <Pill kind={d.severity === "warning" ? "amber" : "blue"}>{d.kind.replaceAll("_", " ").toLowerCase()}</Pill>
                    <strong className="capitalize">{d.name}</strong>
                  </div>
                  <div className="text-sm text-ink-2 mt-1">{d.detail}</div>
                  <div className="text-sm text-ink-2">
                    <strong>Next:</strong> {d.action}
                  </div>
                  <div className="mt-2 flex gap-2">
                    {d.kind === "FILLED_NOT_LISTED" && (
                      <form action={addFillFromClaims} className="flex gap-2 items-center">
                        <input type="hidden" name="householdId" value={h.id} />
                        <input type="hidden" name="name" value={d.name.split(" ")[0]} />
                        <input type="hidden" name="strength" value={d.name.split(" ").slice(1).join(" ")} />
                        <input name="prescriber" className="input py-1" placeholder="Prescriber (confirm with caregiver)" />
                        <button className="btn btn-secondary">Add to list</button>
                      </form>
                    )}
                    {d.medicationId && d.kind === "LISTED_NOT_FILLED" && (
                      <form action={updateMedication}>
                        <input type="hidden" name="householdId" value={h.id} />
                        <input type="hidden" name="medicationId" value={d.medicationId} />
                        <button name="op" value="stop" className="btn btn-secondary">Mark stopped</button>
                      </form>
                    )}
                    {d.medicationId && d.kind === "UNVERIFIED_CAREGIVER_ENTRY" && (
                      <form action={updateMedication} className="flex gap-2">
                        <input type="hidden" name="householdId" value={h.id} />
                        <input type="hidden" name="medicationId" value={d.medicationId} />
                        <button name="op" value="confirm" className="btn btn-secondary">Confirm onto clinic list</button>
                        <button name="op" value="stop" className="btn btn-quiet">Not taking</button>
                      </form>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <form action={completeReconciliation} className="mt-4">
            <input type="hidden" name="householdId" value={h.id} />
            <button className="btn btn-primary">Mark reconciliation complete (reviewed with caregiver)</button>
          </form>
        </Section>

        <Section title="Clinic list">
          <table className="data">
            <thead>
              <tr>
                <th>Medication</th>
                <th>Directions</th>
                <th>Source</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {meds.map((m) => (
                <tr key={m.id} className={m.status === "stopped" ? "opacity-60" : ""}>
                  <td className="capitalize font-semibold">
                    {m.name} <span className="font-normal text-ink-2">{m.strength}</span>
                    {m.prescriber && <div className="text-xs text-ink-3 normal-case font-normal">{m.prescriber}</div>}
                  </td>
                  <td className="text-ink-2">{m.sig}</td>
                  <td>
                    <Pill kind={m.source === "clinic" ? "slate" : m.source === "medicare" ? "blue" : "amber"}>{m.source}</Pill>
                  </td>
                  <td>
                    <Pill kind={m.status === "active" ? "green" : "neutral"}>{m.status}</Pill>
                  </td>
                  <td>
                    <form action={updateMedication}>
                      <input type="hidden" name="householdId" value={h.id} />
                      <input type="hidden" name="medicationId" value={m.id} />
                      {m.status === "active" ? <button name="op" value="stop" className="btn btn-quiet text-xs">Stop</button> : <button name="op" value="reactivate" className="btn btn-quiet text-xs">Reactivate</button>}
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <form action={addClinicMedication} className="card mt-4 grid sm:grid-cols-[1fr_120px_1fr_auto] gap-3 items-end">
            <input type="hidden" name="householdId" value={h.id} />
            <Field label="Add medication"><input name="name" required placeholder="generic name" /></Field>
            <Field label="Strength"><input name="strength" placeholder="10 mg" /></Field>
            <Field label="Directions"><input name="sig" placeholder="1 tablet at bedtime" /></Field>
            <button className="btn btn-primary">Add</button>
          </form>
        </Section>
      </div>
      <div>
        <Section title="Medicare Part D fills" aside={h.medicare.connected ? <span className="text-xs text-ink-3">synced {fmtDate(h.medicare.lastSyncOn)} · {h.medicare.mode}</span> : <Pill>not connected</Pill>}>
          {fills.length === 0 ? (
            <p className="text-sm text-ink-3">No claims data.</p>
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th>Drug</th>
                  <th>Filled</th>
                  <th>Supply</th>
                </tr>
              </thead>
              <tbody>
                {fills.map((f, i) => (
                  <tr key={i}>
                    <td className="capitalize">
                      {f.name} {f.strength}
                      <div className="text-xs text-ink-3 normal-case">NDC {f.ndc}</div>
                    </td>
                    <td className="tnum">{fmtDate(f.fillOn)}</td>
                    <td className="tnum">{f.daysSupply} d</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="text-xs text-ink-3 mt-3">Source: Blue Button 2.0 ExplanationOfBenefit (pharmacy). Authorized by the {h.medicare.authorizedBy ?? "—"}. Matching is by generic name; NDC-level matching follows once a terminology service is attached.</p>
        </Section>
      </div>
    </div>
  );
}
