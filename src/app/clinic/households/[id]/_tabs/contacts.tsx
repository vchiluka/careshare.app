import { logContact } from "@/app/actions";
import { Field, Pill, Section } from "@/components/ui";
import { CADENCE_LABEL, cadenceAdherence, fmtDate } from "@/lib/engine";
import type { HouseholdView } from "@/lib/services/household-view";

export function ContactsTab({ view }: { view: HouseholdView }) {
  const { h, asOf, cadence, staffById } = view;
  const contacts = [...h.contacts].sort((a, b) => b.date.localeCompare(a.date));
  const adherence = cadenceAdherence(h.carePlan.tier, h.contacts, asOf, 90);
  return (
    <div className="grid lg:grid-cols-[1.4fr_1fr] gap-8">
      <Section
        title="Contact log"
        aside={
          <span className="text-sm text-ink-3">
            {h.carePlan.tier ? CADENCE_LABEL[h.carePlan.tier] : "no tier"} · {adherence === null ? "—" : `${adherence}% of periods met (90 d)`}
          </span>
        }
      >
        <div className="mb-3 text-sm">
          {cadence.state === "overdue" ? <Pill kind="amber">Overdue by {cadence.daysOverdue} days</Pill> : cadence.state === "due_soon" ? <Pill kind="blue">Due {fmtDate(cadence.nextDueOn)}</Pill> : cadence.state === "on_track" ? <Pill kind="green">Next due {fmtDate(cadence.nextDueOn)}</Pill> : <Pill>{cadence.state.replaceAll("_", " ")}</Pill>}
        </div>
        <table className="data">
          <thead>
            <tr>
              <th>Date</th>
              <th>How</th>
              <th>Who</th>
              <th>Min</th>
              <th>Summary</th>
              <th>Supports</th>
            </tr>
          </thead>
          <tbody>
            {contacts.map((c) => (
              <tr key={c.id}>
                <td className="tnum text-ink-3">{fmtDate(c.date)}</td>
                <td>{c.kind.replaceAll("_", " ")}</td>
                <td>{staffById[c.byStaffId]?.name ?? c.byStaffId}</td>
                <td className="tnum">{c.minutes}</td>
                <td className="text-ink-2">{c.summary}</td>
                <td className="text-xs text-ink-3">{c.supports.map((s) => s.replaceAll("_", " ")).join(", ")}</td>
              </tr>
            ))}
            {contacts.length === 0 && (
              <tr>
                <td colSpan={6} className="text-ink-3">No contacts logged.</td>
              </tr>
            )}
          </tbody>
        </table>
      </Section>
      <Section title="Log a contact">
        <form action={logContact} className="card space-y-3">
          <input type="hidden" name="householdId" value={h.id} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date"><input type="date" name="date" defaultValue={asOf} max={asOf} /></Field>
            <Field label="Minutes"><input type="number" name="minutes" min={1} defaultValue={15} /></Field>
          </div>
          <Field label="How">
            <select name="kind">
              <option value="phone">Phone</option>
              <option value="video">Video</option>
              <option value="in_person">In person at clinic</option>
              <option value="home_visit">Home visit</option>
              <option value="secure_message">Secure message (clinical)</option>
              <option value="caregiver_group">Caregiver skills group</option>
            </select>
          </Field>
          <Field label="Summary"><textarea name="summary" required placeholder="What was discussed, what changed in the plan." /></Field>
          <fieldset className="text-sm">
            <legend className="font-semibold text-ink-2 mb-1">Documentation stream this time supports</legend>
            <label className="flex items-center gap-2"><input type="checkbox" name="supports" value="care_management" defaultChecked /> Care management</label>
            <label className="flex items-center gap-2"><input type="checkbox" name="supports" value="caregiver_training" /> Caregiver training</label>
            <label className="flex items-center gap-2"><input type="checkbox" name="supports" value="cognitive_assessment" /> Cognitive assessment and care planning</label>
          </fieldset>
          <button className="btn btn-primary">Log contact</button>
          <p className="text-xs text-ink-3">Logging a contact clears any open cadence escalation. During the pilot the clinic does not bill Medicare for coordination delivered through CareShare; the streams exist so the documentation is ready when billing turns on afterward.</p>
        </form>
      </Section>
    </div>
  );
}
