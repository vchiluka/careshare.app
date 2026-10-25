import { recordEdVisit } from "@/app/actions";
import { Field, Pill, Section } from "@/components/ui";
import { fmtDate } from "@/lib/engine";
import type { HouseholdView } from "@/lib/services/household-view";

export function LogTab({ view }: { view: HouseholdView }) {
  const { h, asOf } = view;
  const entries = [...h.symptomLog].sort((a, b) => b.date.localeCompare(a.date));
  const cgName = (id: string) => h.caregivers.find((c) => c.id === id)?.givenName ?? "caregiver";
  return (
    <div className="grid lg:grid-cols-[1.4fr_1fr] gap-8">
      <Section title="What the caregiver logged" aside={<span className="text-sm text-ink-3">{entries.length} entries</span>}>
        <table className="data">
          <thead>
            <tr>
              <th>Date</th>
              <th>What</th>
              <th>Severity</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id}>
                <td className="tnum text-ink-3">{fmtDate(e.date)}</td>
                <td className="capitalize">{e.kind}</td>
                <td>
                  <Pill kind={e.severity === 3 ? "red" : e.severity === 2 ? "amber" : "neutral"}>{["", "mild", "moderate", "severe"][e.severity]}</Pill>
                </td>
                <td className="text-ink-2">
                  {e.note} <span className="text-xs text-ink-3">— {cgName(e.reportedBy)}</span>
                </td>
              </tr>
            ))}
            {entries.length === 0 && (
              <tr>
                <td colSpan={4} className="text-ink-3">Nothing logged. The caregiver can log once her proxy is confirmed.</td>
              </tr>
            )}
          </tbody>
        </table>
      </Section>
      <div>
        <Section title="Emergency and hospital visits">
          <ul className="text-sm divide-y divide-rule">
            {[...h.edVisits].sort((a, b) => b.date.localeCompare(a.date)).map((v, i) => (
              <li key={i} className="py-2">
                <span className="tnum">{fmtDate(v.date)}</span> · {v.reason} {v.admitted && <Pill kind="amber">admitted</Pill>} <span className="text-xs text-ink-3">· {v.source.replaceAll("_", " ")}</span>
              </li>
            ))}
            {h.edVisits.length === 0 && <li className="py-2 text-ink-3">None recorded.</li>}
          </ul>
          <form action={recordEdVisit} className="card mt-4 space-y-3">
            <input type="hidden" name="householdId" value={h.id} />
            <p className="text-xs text-ink-3">Partner-reported from the hospital&rsquo;s discharge feed in the pilot; entered by hand until that connection lands.</p>
            <div className="grid grid-cols-[auto_1fr] gap-3">
              <Field label="Date"><input name="date" type="date" defaultValue={asOf} required /></Field>
              <Field label="Reason"><input name="reason" required placeholder="Fall with hip pain" /></Field>
            </div>
            <label className="text-sm flex items-center gap-2">
              <input type="checkbox" name="admitted" /> Admitted
            </label>
            <button className="btn btn-secondary">Record visit</button>
          </form>
        </Section>
      </div>
    </div>
  );
}
