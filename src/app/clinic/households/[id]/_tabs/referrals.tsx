import { clinicReferral } from "@/app/actions";
import { Field, Pill, Section } from "@/components/ui";
import { fmtDate } from "@/lib/engine";
import type { HouseholdView } from "@/lib/services/household-view";

const STATUS_TONE = { suggested: "blue", contacted: "amber", enrolled: "green", declined: "neutral", not_reached: "amber", closed: "neutral" } as const;

export function ReferralsTab({ view }: { view: HouseholdView }) {
  const { h, resourcesById } = view;
  const local = Object.values(resourcesById).filter((r) => r.localityFips.includes(h.patient.localityFips));
  const refs = [...h.referrals].sort((a, b) => b.updatedOn.localeCompare(a.updatedOn));
  return (
    <div className="grid lg:grid-cols-[1.4fr_1fr] gap-8">
      <Section title="Community referrals and the closed loop">
        <p className="text-sm text-ink-2 mb-3">Resources come from the statewide directory for {view.locality.name}. Recording the outcome and reporting it back (consented, de-identified: listing, locality, outcome) gives the directory partner the thread it loses today.</p>
        <table className="data">
          <thead>
            <tr>
              <th>Resource</th>
              <th>Suggested</th>
              <th>Status</th>
              <th>Outcome</th>
              <th>Reported back</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {refs.map((r) => {
              const res = resourcesById[r.resourceId];
              return (
                <tr key={r.id}>
                  <td>
                    <div className="font-semibold">{res?.name}</div>
                    <div className="text-xs text-ink-3">{res?.category.replaceAll("_", " ")} · {res?.directory.listingId}</div>
                  </td>
                  <td className="text-ink-2">
                    {fmtDate(r.suggestedOn)}
                    <div className="text-xs text-ink-3">by {r.suggestedBy}</div>
                  </td>
                  <td>
                    <Pill kind={STATUS_TONE[r.status]}>{r.status.replaceAll("_", " ")}</Pill>
                  </td>
                  <td className="text-ink-2">{r.outcomeNote ?? "—"}</td>
                  <td>{r.reportedBackOn ? <Pill kind="green">{fmtDate(r.reportedBackOn)}</Pill> : <span className="text-xs text-ink-3">not yet</span>}</td>
                  <td>
                    <form action={clinicReferral} className="flex flex-col gap-1 min-w-44">
                      <input type="hidden" name="householdId" value={h.id} />
                      <input type="hidden" name="referralId" value={r.id} />
                      <input type="hidden" name="resourceId" value={r.resourceId} />
                      <select name="status" className="input py-1 text-xs" defaultValue={r.status}>
                        {["suggested", "contacted", "enrolled", "not_reached", "declined", "closed"].map((s) => (
                          <option key={s} value={s}>{s.replaceAll("_", " ")}</option>
                        ))}
                      </select>
                      <input name="note" className="input py-1 text-xs" placeholder="outcome note" />
                      <label className="text-xs flex items-center gap-1"><input type="checkbox" name="reportBack" defaultChecked /> report back to directory</label>
                      <button className="btn btn-secondary py-1 text-xs">Update</button>
                    </form>
                  </td>
                </tr>
              );
            })}
            {refs.length === 0 && (
              <tr>
                <td colSpan={6} className="text-ink-3">No referrals yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </Section>
      <Section title="Suggest a resource">
        <form action={clinicReferral} className="card space-y-3">
          <input type="hidden" name="householdId" value={h.id} />
          <input type="hidden" name="status" value="suggested" />
          <Field label={`Listed for ${view.locality.name}`}>
            <select name="resourceId">
              {local.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.category.replaceAll("_", " ")})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Why (shows to the caregiver)"><input name="note" placeholder="Respite hours while you recover from the fall" /></Field>
          <button className="btn btn-primary">Suggest to caregiver</button>
        </form>
      </Section>
    </div>
  );
}
