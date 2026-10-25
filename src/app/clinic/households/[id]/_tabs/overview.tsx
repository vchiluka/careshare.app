import Link from "next/link";
import { acknowledgeEscalation, resolveEscalation } from "@/app/actions";
import { Pill, Section, severityTone } from "@/components/ui";
import { CADENCE_LABEL, fmtDate, TIER_LABELS, zbi12Band } from "@/lib/engine";
import type { HouseholdView } from "@/lib/services/household-view";

export function OverviewTab({ view }: { view: HouseholdView }) {
  const { h, signals, cadence, primary, tier, staffById } = view;
  const open = h.escalations.filter((e) => e.status !== "resolved").sort((a, b) => ({ critical: 0, warning: 1, info: 2 })[a.severity] - ({ critical: 0, warning: 1, info: 2 })[b.severity]);
  const infos = signals.filter((s) => s.severity === "info");
  const lastZ = primary?.health.zbi.at(-1);
  const lastP = primary?.health.phq2.at(-1);
  return (
    <div className="grid lg:grid-cols-[1.4fr_1fr] gap-8">
      <div>
        <Section title="Escalations" aside={<span className="text-sm text-ink-3">{open.length} open</span>}>
          {open.length === 0 ? (
            <p className="text-sm text-ink-3">Nothing open. Signals that need action appear here as the caregiver logs.</p>
          ) : (
            <ul className="space-y-3">
              {open.map((e) => (
                <li key={e.id} className="card py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <Pill kind={severityTone(e.severity)}>{e.severity}</Pill>
                        <span className="text-xs text-ink-3">
                          {e.rule.replaceAll("_", " ").toLowerCase()} · raised {fmtDate(e.raisedOn)}
                          {e.status === "acknowledged" ? ` · acknowledged by ${staffById[e.acknowledgedBy ?? ""]?.name ?? "staff"}` : ""}
                        </span>
                      </div>
                      <div className="mt-1.5">{e.message}</div>
                      <div className="text-sm text-ink-2 mt-1">
                        <strong>Next:</strong> {e.action}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 items-center">
                    {e.status === "open" && (
                      <form action={acknowledgeEscalation}>
                        <input type="hidden" name="householdId" value={h.id} />
                        <input type="hidden" name="escalationId" value={e.id} />
                        <button className="btn btn-secondary">I have this</button>
                      </form>
                    )}
                    <form action={resolveEscalation} className="flex gap-2 flex-1">
                      <input type="hidden" name="householdId" value={h.id} />
                      <input type="hidden" name="escalationId" value={e.id} />
                      <input name="resolution" className="input flex-1" placeholder="What was done" />
                      <button className="btn btn-primary">Resolve</button>
                    </form>
                    {e.rule === "MED_DISCREPANCY" && <Link href={`/clinic/households/${h.id}?tab=medications`} className="text-sm underline">Reconcile</Link>}
                    {e.rule === "PHQ2_POSITIVE" && <Link href={`/clinic/households/${h.id}?tab=caregiver`} className="text-sm underline">Route to care</Link>}
                    {e.rule === "TRANSPORT_UNARRANGED" && <Link href={`/clinic/households/${h.id}?tab=visits`} className="text-sm underline">Arrange ride</Link>}
                    {e.rule === "CADENCE_OVERDUE" && <Link href={`/clinic/households/${h.id}?tab=contacts`} className="text-sm underline">Log contact</Link>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>
        {infos.length > 0 && (
          <Section title="Also worth knowing">
            <ul className="space-y-2 text-sm">
              {infos.map((s) => (
                <li key={s.key} className="flex gap-2">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue" />
                  <span>
                    {s.message} <span className="text-ink-3">{s.action}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>
      <div>
        <Section title="Tier and cadence">
          <dl className="text-sm space-y-2">
            <div>
              <dt className="text-ink-3">Stage</dt>
              <dd>
                {h.staging ? `CDR ${h.staging.cdrGlobal ?? "—"}, FAST ${h.staging.fast ?? "—"}${h.staging.npiqSeverity !== undefined ? `, NPI-Q ${h.staging.npiqSeverity}` : ""} (${fmtDate(h.staging.assessedOn)})` : "Not staged"} {tier.staging.conflict && <Pill kind="amber">conflict</Pill>}
              </dd>
            </div>
            <div>
              <dt className="text-ink-3">Caregiver strain</dt>
              <dd>{lastZ ? `ZBI-12 ${lastZ.total}/48, ${zbi12Band(lastZ.total)} (${fmtDate(lastZ.date)})` : "No check-in yet"}</dd>
            </div>
            <div>
              <dt className="text-ink-3">Tier</dt>
              <dd>
                {h.carePlan.tier ? TIER_LABELS[h.carePlan.tier] : "Not set"}
                {tier.blockers.length > 0 && <div className="text-amber text-xs mt-0.5">{tier.blockers.join(" ")}</div>}
              </dd>
            </div>
            <div>
              <dt className="text-ink-3">Contact cadence</dt>
              <dd>
                {h.carePlan.tier ? CADENCE_LABEL[h.carePlan.tier] : "—"}; last {fmtDate(cadence.lastContactOn)}; next due {fmtDate(cadence.nextDueOn)}{" "}
                {cadence.state === "overdue" && <Pill kind="amber">{cadence.daysOverdue}d overdue</Pill>}
              </dd>
            </div>
            <div>
              <dt className="text-ink-3">Caregiver mood screen</dt>
              <dd>{lastP ? `PHQ-2 ${lastP.total}/6 (${fmtDate(lastP.date)})${lastP.total >= 3 ? (lastP.routedOn ? ", routed" : ", not yet routed") : ""}` : "None yet"}</dd>
            </div>
          </dl>
        </Section>
        <Section title="Household">
          <dl className="text-sm space-y-2">
            <div>
              <dt className="text-ink-3">Lives</dt>
              <dd>
                {h.patient.residence.replaceAll("_", " ")}
                {primary ? `, with ${primary.livesWithPatient ? primary.givenName : "no one; " + primary.givenName + " nearby"}` : ", alone"}
              </dd>
            </div>
            <div>
              <dt className="text-ink-3">Caregivers</dt>
              <dd>
                {h.caregivers.map((c) => (
                  <div key={c.id}>
                    {c.givenName} {c.familyName}, {c.relationship.replaceAll("_", " ")}, {c.hoursPerWeek} h/wk{c.isPrimary ? " (primary)" : ""} · {c.access.smartphone ? "smartphone" : "no smartphone"}, {c.access.broadband === "ok" ? "broadband" : c.access.broadband === "low" ? "poor connection" : "no internet"}, prefers {c.access.preferredChannel}
                  </div>
                ))}
                {h.caregivers.length === 0 && "None recorded"}
              </dd>
            </div>
            <div>
              <dt className="text-ink-3">Diagnoses</dt>
              <dd>{h.patient.diagnoses.map((d) => `${d.display} (${d.code})`).join("; ")}</dd>
            </div>
            <div>
              <dt className="text-ink-3">Visits</dt>
              <dd>
                AWV {fmtDate(h.lastAnnualWellnessOn)} · cognitive assessment {fmtDate(h.lastCognitiveAssessmentOn)}
              </dd>
            </div>
          </dl>
        </Section>
      </div>
    </div>
  );
}
