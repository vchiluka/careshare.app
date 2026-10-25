import { linkEhr, pushPlanToEhr, reviewCarePlan, setGoalStatus, updateStaging } from "@/app/actions";
import { Field, Pill, Section } from "@/components/ui";
import { CADENCE_LABEL, fmtDate, TIER_LABELS } from "@/lib/engine";
import type { HouseholdView } from "@/lib/services/household-view";

const FAST = ["1", "2", "3", "4", "5", "6a", "6b", "6c", "6d", "6e", "7a", "7b", "7c", "7d", "7e", "7f"];

export function PlanTab({ view }: { view: HouseholdView }) {
  const { h, tier } = view;
  const plan = h.carePlan;
  return (
    <div className="grid lg:grid-cols-[1.3fr_1fr] gap-8">
      <div>
        <Section title="Shared goals" aside={<span className="text-sm text-ink-3">reviewed {fmtDate(plan.reviewedOn)}</span>}>
          <ul className="divide-y divide-rule">
            {plan.goals.map((g) => (
              <li key={g.id} className="py-2.5 flex items-center gap-3 text-sm">
                <Pill kind={g.status === "met" ? "green" : g.status === "dropped" ? "neutral" : "slate"}>{g.status}</Pill>
                <span className={`flex-1 ${g.status !== "active" ? "text-ink-3" : ""}`}>
                  {g.text} <span className="text-ink-3">· {g.owner}</span>
                </span>
                {g.status === "active" && (
                  <form action={setGoalStatus} className="flex gap-1">
                    <input type="hidden" name="householdId" value={h.id} />
                    <input type="hidden" name="goalId" value={g.id} />
                    <button name="status" value="met" className="btn btn-quiet text-xs">Met</button>
                    <button name="status" value="dropped" className="btn btn-quiet text-xs">Drop</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
          <form action={reviewCarePlan} className="card mt-4 space-y-3">
            <input type="hidden" name="householdId" value={h.id} />
            <div className="grid sm:grid-cols-[1fr_auto] gap-3">
              <Field label="Add a goal (optional)"><input name="newGoal" placeholder="e.g. Trial adult day two mornings a week" /></Field>
              <Field label="Owner">
                <select name="owner">
                  <option value="shared">Together</option>
                  <option value="caregiver">Caregiver</option>
                  <option value="clinic">Clinic</option>
                </select>
              </Field>
            </div>
            <Field label="Respite arrangement (optional)"><input name="respite" defaultValue={plan.respiteArrangement} placeholder="AAA respite 6 h/wk from Nov 3; church volunteer Tuesdays" /></Field>
            <button className="btn btn-primary">Save and mark plan reviewed</button>
          </form>
        </Section>
        <Section title="Watch for and who to call (what the caregiver sees)">
          <ul className="list-disc pl-5 text-sm text-ink-2 space-y-1">
            {plan.watchFor.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
          <p className="text-sm text-ink-2 mt-3">{plan.whoToCall.map((w) => `${w.label}: ${w.phone}`).join(" · ")}</p>
        </Section>
      </div>
      <div>
        <Section title="Staging and tier">
          <p className="text-sm text-ink-2 mb-3">
            Stage from CDR (clinician-rated) and FAST; caregiver burden from the ZBI-12 check-in. The tier sets how often the clinic must be in touch. Structure adapted from CMS&rsquo;s published dementia care-management requirements; no program enrollment is involved.
          </p>
          <dl className="text-sm space-y-1 mb-4">
            <div className="flex justify-between"><dt className="text-ink-3">Current</dt><dd>{plan.tier ? TIER_LABELS[plan.tier] : "Not set"}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-3">Cadence</dt><dd>{plan.tier ? CADENCE_LABEL[plan.tier] : "—"}</dd></div>
          </dl>
          <ul className="text-xs text-ink-3 space-y-0.5 mb-4">
            {tier.evidence.map((e) => (
              <li key={e}>{e}</li>
            ))}
            {tier.blockers.map((b) => (
              <li key={b} className="text-amber">{b}</li>
            ))}
          </ul>
          <form action={updateStaging} className="card space-y-3">
            <input type="hidden" name="householdId" value={h.id} />
            <div className="grid grid-cols-3 gap-3">
              <Field label="CDR global">
                <select name="cdr" defaultValue={h.staging?.cdrGlobal?.toString() ?? ""}>
                  <option value="">—</option>
                  {["0", "0.5", "1", "2", "3"].map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </Field>
              <Field label="FAST">
                <select name="fast" defaultValue={h.staging?.fast ?? ""}>
                  <option value="">—</option>
                  {FAST.map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </Field>
              <Field label="NPI-Q severity"><input name="npiq" type="number" min={0} max={36} defaultValue={h.staging?.npiqSeverity} /></Field>
            </div>
            <button className="btn btn-primary">Save staging and recompute tier</button>
          </form>
        </Section>
        <Section title="EHR">
          {h.patient.ehrPatientId ? (
            <div className="text-sm">
              <p>
                Linked to EHR record <code>{h.patient.ehrPatientId}</code>.
              </p>
              <form action={pushPlanToEhr} className="mt-3">
                <input type="hidden" name="householdId" value={h.id} />
                <button className="btn btn-secondary">Write this plan to the EHR as a CarePlan</button>
              </form>
            </div>
          ) : (
            <form action={linkEhr}>
              <input type="hidden" name="householdId" value={h.id} />
              <p className="text-sm text-ink-2 mb-3">Match {h.patient.givenName} to the clinic&rsquo;s EHR by name and date of birth so plans and summaries flow both ways. The Console works without this; integration is the month-five milestone.</p>
              <button className="btn btn-secondary">Match in EHR</button>
            </form>
          )}
        </Section>
      </div>
    </div>
  );
}
