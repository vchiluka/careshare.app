import { scheduleAppointment, updateAppointment } from "@/app/actions";
import { Field, Pill, Section } from "@/components/ui";
import { fmtDate, labelPurpose } from "@/lib/engine";
import type { HouseholdView } from "@/lib/services/household-view";

export function VisitsTab({ view }: { view: HouseholdView }) {
  const { h, asOf, resourcesById } = view;
  const appts = [...h.appointments].sort((a, b) => b.date.localeCompare(a.date));
  const rides = Object.values(resourcesById).filter((r) => r.category === "transport" && r.localityFips.includes(h.patient.localityFips));
  return (
    <div className="grid lg:grid-cols-[1.4fr_1fr] gap-8">
      <Section title="Appointments">
        <table className="data">
          <thead>
            <tr>
              <th>Date</th>
              <th>Purpose</th>
              <th>With</th>
              <th>Ride</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {appts.map((a) => (
              <tr key={a.id}>
                <td className="tnum">
                  {fmtDate(a.date)}
                  {a.time ? <div className="text-xs text-ink-3">{a.time}</div> : null}
                </td>
                <td className="capitalize">{a.forPerson === "caregiver" ? "Caregiver's own visit" : labelPurpose(a.purpose)}</td>
                <td className="text-ink-2">
                  {a.withName}
                  <div className="text-xs text-ink-3">{a.location}</div>
                </td>
                <td>
                  {a.forPerson === "patient" && a.transport.needed ? (
                    a.transport.arranged ? (
                      <Pill kind="green">{a.transport.provider}</Pill>
                    ) : a.status === "scheduled" ? (
                      <form action={updateAppointment} className="flex gap-1">
                        <input type="hidden" name="householdId" value={h.id} />
                        <input type="hidden" name="appointmentId" value={a.id} />
                        <select name="provider" className="input py-1 text-xs">
                          {rides.map((r) => (
                            <option key={r.id}>{r.name}</option>
                          ))}
                          <option>Medicaid NEMT broker</option>
                          <option>Family</option>
                        </select>
                        <button name="op" value="arrange" className="btn btn-secondary py-1 text-xs">Arrange</button>
                      </form>
                    ) : (
                      <Pill kind="amber">not arranged</Pill>
                    )
                  ) : (
                    <span className="text-xs text-ink-3">—</span>
                  )}
                </td>
                <td>
                  <Pill kind={a.status === "completed" ? "green" : a.status === "missed" ? "amber" : a.status === "scheduled" ? "blue" : "neutral"}>{a.status}</Pill>
                </td>
                <td>
                  {a.status === "scheduled" && a.forPerson === "patient" && (
                    <form action={updateAppointment} className="flex gap-1">
                      <input type="hidden" name="householdId" value={h.id} />
                      <input type="hidden" name="appointmentId" value={a.id} />
                      <button name="op" value="completed" className="btn btn-quiet text-xs">Done</button>
                      <button name="op" value="missed" className="btn btn-quiet text-xs">Missed</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
      <Section title="Schedule a visit">
        <form action={scheduleAppointment} className="card space-y-3">
          <input type="hidden" name="householdId" value={h.id} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date"><input type="date" name="date" required min={asOf} /></Field>
            <Field label="Time"><input name="time" placeholder="10:20 AM" /></Field>
          </div>
          <Field label="Purpose">
            <select name="purpose">
              <option value="annual_wellness">Annual wellness visit</option>
              <option value="cognitive_assessment">Cognitive assessment and care-plan visit</option>
              <option value="follow_up">Follow-up</option>
              <option value="lab">Lab</option>
              <option value="specialist">Specialist</option>
              <option value="behavioral_health">Behavioral health</option>
            </select>
          </Field>
          <Field label="With"><input name="withName" defaultValue="Dr. Carla Pannell" /></Field>
          <Field label="Location"><input name="location" defaultValue={view.site.name} /></Field>
          <label className="text-sm flex items-center gap-2">
            <input type="checkbox" name="transportNeeded" /> Caregiver needs a ride arranged
          </label>
          <button className="btn btn-primary">Schedule</button>
        </form>
        <p className="text-xs text-ink-3 mt-3">Completing an annual wellness or cognitive assessment visit updates the pilot access measures.</p>
      </Section>
    </div>
  );
}
