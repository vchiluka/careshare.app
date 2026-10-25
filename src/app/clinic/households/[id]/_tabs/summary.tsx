import { generateSummary } from "@/app/actions";
import { Field, Pill, Section } from "@/components/ui";
import { buildMonthlySummary, contactMinutesByStream, fmtDate, fmtMonth, monthOf, TIER_LABELS } from "@/lib/engine";
import type { HouseholdView } from "@/lib/services/household-view";

export function SummaryTab({ view }: { view: HouseholdView }) {
  const { h, asOf, primary } = view;
  const thisMonth = monthOf(asOf);
  const live = buildMonthlySummary(h, thisMonth, asOf);
  const months = [...new Set([...h.summaries.map((s) => s.month), thisMonth])].sort().reverse();
  const streams = contactMinutesByStream(h, thisMonth);
  return (
    <div className="grid lg:grid-cols-[1.3fr_1fr] gap-8">
      <div>
        <Section title={`Structured summary, ${fmtMonth(thisMonth)} (to date)`}>
          <div className="card">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              <div><div className="text-ink-3">Tier</div><div>{live.tier ? TIER_LABELS[live.tier] : "—"}</div></div>
              <div><div className="text-ink-3">Clinic contacts</div><div className="tnum">{live.contacts} · {live.contactMinutes} min</div></div>
              <div><div className="text-ink-3">Caregiver check-ins</div><div className="tnum">{live.caregiverCheckIns}</div></div>
              <div><div className="text-ink-3">Symptoms logged</div><div className="tnum">{live.symptomsLogged}{live.fallsLogged ? ` (${live.fallsLogged} falls)` : ""}</div></div>
              <div><div className="text-ink-3">Open escalations</div><div className="tnum">{live.openEscalations}</div></div>
              <div><div className="text-ink-3">Med reconciliation</div><div>{live.medReconciliationCompleted ? <Pill kind="green">done</Pill> : <Pill kind="amber">not this month</Pill>}</div></div>
              <div><div className="text-ink-3">Caregiver strain</div><div className="tnum">{live.zbiTotal !== undefined ? `ZBI-12 ${live.zbiTotal}` : "—"}</div></div>
              <div><div className="text-ink-3">Caregiver mood</div><div className="tnum">{live.phq2Total !== undefined ? `PHQ-2 ${live.phq2Total}` : "—"}</div></div>
            </div>
            {live.notes && <p className="mt-4 text-sm text-ink-2">{live.notes}</p>}
          </div>
          <form action={generateSummary} className="mt-4 flex flex-wrap items-end gap-3">
            <input type="hidden" name="householdId" value={h.id} />
            <Field label="Month">
              <select name="month" defaultValue={thisMonth}>
                {months.map((m) => (
                  <option key={m} value={m}>{fmtMonth(m)}</option>
                ))}
              </select>
            </Field>
            <label className="text-sm flex items-center gap-2 pb-3">
              <input type="checkbox" name="toEhr" disabled={!h.patient.ehrPatientId} /> Also write to the EHR as a note {h.patient.ehrPatientId ? "" : "(link EHR first)"}
            </label>
            <button className="btn btn-primary">Generate and file</button>
          </form>
        </Section>
        <Section title="Past months">
          <table className="data">
            <thead>
              <tr>
                <th>Month</th>
                <th>Contacts</th>
                <th>Check-ins</th>
                <th>Symptoms</th>
                <th>ZBI-12</th>
                <th>PHQ-2</th>
                <th>Recon</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {[...h.summaries].sort((a, b) => b.month.localeCompare(a.month)).map((s) => (
                <tr key={s.month}>
                  <td>{fmtMonth(s.month)}</td>
                  <td className="tnum">{s.contacts} · {s.contactMinutes}m</td>
                  <td className="tnum">{s.caregiverCheckIns}</td>
                  <td className="tnum">{s.symptomsLogged}</td>
                  <td className="tnum">{s.zbiTotal ?? "—"}</td>
                  <td className="tnum">{s.phq2Total ?? "—"}</td>
                  <td>{s.medReconciliationCompleted ? "yes" : "no"}</td>
                  <td className="text-ink-2 text-xs">{s.notes}</td>
                </tr>
              ))}
              {h.summaries.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-ink-3">No prior months.</td>
                </tr>
              )}
            </tbody>
          </table>
        </Section>
      </div>
      <div>
        <Section title="Documentation export (this month)">
          <p className="text-sm text-ink-2">Time by the stream it supports, so the practice&rsquo;s billing team has what it needs after the pilot without re-keying. Nothing is billed from here; this is the evidence.</p>
          <table className="data mt-3">
            <tbody>
              <tr><td>Care management time</td><td className="tnum text-right">{streams.care_management} min</td></tr>
              <tr><td>Caregiver training time</td><td className="tnum text-right">{streams.caregiver_training} min</td></tr>
              <tr><td>Cognitive assessment and care planning</td><td className="tnum text-right">{streams.cognitive_assessment} min</td></tr>
              <tr><td>Verified representative on file</td><td className="text-right">{primary?.proxy.status === "confirmed" ? `yes, since ${fmtDate(primary.proxy.confirmedOn)}` : "no"}</td></tr>
              <tr><td>Written care plan shared with caregiver</td><td className="text-right">{h.carePlan.reviewedOn ? `reviewed ${fmtDate(h.carePlan.reviewedOn)}` : "no"}</td></tr>
              <tr><td>Medication reconciliation</td><td className="text-right">{h.medReconciliationCompletedOn ? fmtDate(h.medReconciliationCompletedOn) : "none"}</td></tr>
              <tr><td>Annual wellness visit</td><td className="text-right">{fmtDate(h.lastAnnualWellnessOn)}</td></tr>
              <tr><td>Cognitive assessment visit</td><td className="text-right">{fmtDate(h.lastCognitiveAssessmentOn)}</td></tr>
            </tbody>
          </table>
          <p className="text-xs text-ink-3 mt-3">Which codes the clinic bills after August 2027 (care management, caregiver training, cognitive assessment) is the clinic&rsquo;s decision with its billing counsel; CareShare keeps the documentation in the shape each requires.</p>
        </Section>
      </div>
    </div>
  );
}
