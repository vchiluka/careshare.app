import { confirmProxy, recordInPersonVerification, revokeProxy, routePhq2, sendSmsPrompt } from "@/app/actions";
import { Field, Pill, Section } from "@/components/ui";
import { fmtDate, zbi12Band } from "@/lib/engine";
import type { HouseholdView } from "@/lib/services/household-view";

export function CaregiverTab({ view }: { view: HouseholdView }) {
  const { h, asOf } = view;
  if (h.caregivers.length === 0) return <p className="text-sm text-ink-3">No caregiver on this household. Individual plan; the AAA daily check-in call is the backup.</p>;
  return (
    <div className="space-y-10">
      {h.caregivers.map((c) => {
        const verified = c.identity.status === "verified";
        const zbis = [...c.health.zbi].sort((a, b) => a.date.localeCompare(b.date));
        const phqs = [...c.health.phq2].sort((a, b) => a.date.localeCompare(b.date));
        const bps = [...c.health.bp].sort((a, b) => b.date.localeCompare(a.date));
        return (
          <div key={c.id} className="grid lg:grid-cols-2 gap-8">
            <div>
              <h2>
                {c.givenName} {c.familyName} <span className="text-ink-3 font-normal text-base">{c.relationship.replaceAll("_", " ")}{c.isPrimary ? ", primary" : ""}</span>
              </h2>
              <div className="text-sm text-ink-2 mt-1">
                {c.phone} · {c.access.smartphone ? "smartphone" : "no smartphone"}, {c.access.broadband === "ok" ? "broadband" : c.access.broadband === "low" ? "poor connection" : "no internet"}, prefers {c.access.preferredChannel} · {c.hoursPerWeek} h/wk
              </div>

              <Section title="Identity">
                <div className="flex items-center gap-2">
                  {verified ? <Pill kind="green">Verified {c.identity.assurance}/{c.identity.authenticator}</Pill> : <Pill kind={c.identity.status === "failed" || c.identity.status === "in_person_pending" ? "amber" : "neutral"}>{c.identity.status.replaceAll("_", " ")}</Pill>}
                  {verified && (
                    <span className="text-sm text-ink-3">
                      via {c.identity.provider === "in_person" ? "in person at the clinic" : c.identity.provider === "idme" ? "ID.me" : "CLEAR"} on {fmtDate(c.identity.verifiedOn)} · ref {c.identity.subject}
                    </span>
                  )}
                </div>
                {!verified && (
                  <div className="mt-3 space-y-3 text-sm">
                    {c.identity.failureReason && <p className="text-ink-2">{c.identity.failureReason}</p>}
                    <p className="text-ink-2">
                      {c.identity.attempts} remote attempt{c.identity.attempts === 1 ? "" : "s"}. Options: send the link again by text, or verify in person. In-person is a documented proofing event by the enrollment coordinator (government photo ID plus a second piece of evidence, face to face); it is the rural fallback, not a shortcut.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <form action={sendSmsPrompt}>
                        <input type="hidden" name="householdId" value={h.id} />
                        <input type="hidden" name="caregiverId" value={c.id} />
                        <input type="hidden" name="template" value="verify" />
                        <button className="btn btn-secondary">Text the verification link</button>
                      </form>
                    </div>
                    <form action={recordInPersonVerification} className="card py-3 space-y-2">
                      <input type="hidden" name="householdId" value={h.id} />
                      <input type="hidden" name="caregiverId" value={c.id} />
                      <label className="flex items-start gap-2">
                        <input type="checkbox" name="attest" required className="mt-1" />
                        <span>I checked {c.givenName}&rsquo;s government photo ID and a second piece of evidence in person today and attest that they match.</span>
                      </label>
                      <button className="btn btn-primary">Record in-person verification</button>
                    </form>
                  </div>
                )}
              </Section>

              <Section title="Representative status (proxy)">
                <div className="flex items-center gap-2">
                  <Pill kind={c.proxy.status === "confirmed" ? "green" : c.proxy.status === "requested" ? "amber" : "neutral"}>{c.proxy.status.replaceAll("_", " ")}</Pill>
                  {c.proxy.status === "confirmed" && (
                    <span className="text-sm text-ink-3">
                      consent ({c.proxy.consentBasis?.replaceAll("_", " ")}) recorded {fmtDate(c.proxy.consentRecordedOn)}; confirmed {fmtDate(c.proxy.confirmedOn)} by {view.staffById[c.proxy.confirmedBy ?? ""]?.name ?? "staff"}
                    </span>
                  )}
                </div>
                {c.proxy.status !== "confirmed" ? (
                  verified ? (
                    <form action={confirmProxy} className="mt-3 card py-3 space-y-3">
                      <input type="hidden" name="householdId" value={h.id} />
                      <input type="hidden" name="caregiverId" value={c.id} />
                      <p className="text-sm text-ink-2">
                        Confirming once gives {c.givenName} the care plan, medications, visits, messages, the symptom log and Medicare records for {h.patient.givenName}. Record the basis for consent.
                      </p>
                      <Field label="Consent basis">
                        <select name="basis">
                          <option value="patient">{h.patient.givenName} consented (has capacity)</option>
                          <option value="poa_healthcare">Health care power of attorney on file</option>
                          <option value="legal_guardian">Court-appointed guardian</option>
                        </select>
                      </Field>
                      <button className="btn btn-primary">Confirm as representative</button>
                    </form>
                  ) : (
                    <p className="mt-2 text-sm text-ink-3">Cannot confirm until identity is verified at IAL2.</p>
                  )
                ) : (
                  <form action={revokeProxy} className="mt-3">
                    <input type="hidden" name="householdId" value={h.id} />
                    <input type="hidden" name="caregiverId" value={c.id} />
                    <button className="btn btn-danger">Revoke access</button>
                  </form>
                )}
              </Section>
            </div>

            <div>
              <Section title={`${c.givenName}'s own health`}>
                <p className="text-sm text-ink-2 mb-3">The caregiver is the second patient in this household. Nothing here is a diagnosis; a positive screen is routed to her own provider or behavioral health and the hand-off is recorded.</p>
                <dl className="text-sm space-y-3">
                  <div>
                    <dt className="text-ink-3">Strain (ZBI-12)</dt>
                    <dd className="flex flex-wrap gap-1.5 mt-1">
                      {zbis.map((z) => (
                        <Pill key={z.date} kind={zbi12Band(z.total) === "high" ? "red" : zbi12Band(z.total) === "moderate" ? "amber" : "green"}>
                          {z.total} · {fmtDate(z.date)}
                        </Pill>
                      ))}
                      {zbis.length === 0 && <span className="text-ink-3">None yet</span>}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-ink-3">Mood screen (PHQ-2)</dt>
                    <dd className="mt-1 space-y-1.5">
                      {phqs.map((p) => (
                        <div key={p.date} className="flex items-center gap-2">
                          <Pill kind={p.total >= 3 ? "amber" : "green"}>
                            {p.total}/6 · {fmtDate(p.date)}
                          </Pill>
                          {p.total >= 3 &&
                            (p.routedOn ? (
                              <span className="text-xs text-ink-3">routed {fmtDate(p.routedOn)}</span>
                            ) : (
                              <form action={routePhq2}>
                                <input type="hidden" name="householdId" value={h.id} />
                                <input type="hidden" name="caregiverId" value={c.id} />
                                <input type="hidden" name="date" value={p.date} />
                                <button className="btn btn-secondary py-1">Record warm hand-off</button>
                              </form>
                            ))}
                        </div>
                      ))}
                      {phqs.length === 0 && <span className="text-ink-3">None yet</span>}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-ink-3">Home blood pressure</dt>
                    <dd className="mt-1 flex flex-wrap gap-1.5">
                      {bps.slice(0, 6).map((b) => (
                        <Pill key={b.date} kind={b.systolic >= 180 || b.diastolic >= 120 ? "red" : b.systolic >= 140 || b.diastolic >= 90 ? "amber" : "green"}>
                          {b.systolic}/{b.diastolic} · {fmtDate(b.date)}
                        </Pill>
                      ))}
                      {bps.length === 0 && <span className="text-ink-3">{c.health.hasHomeBpCuff ? "No readings yet" : "No cuff; lend one from the pilot supply"}</span>}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-ink-3">Her own primary care</dt>
                    <dd>
                      Last visit {fmtDate(c.health.ownPcpLastVisit)}
                      {c.health.ownPcpNextScheduled ? `; next ${fmtDate(c.health.ownPcpNextScheduled)}` : ""}
                    </dd>
                  </div>
                </dl>
              </Section>
              <Section title="Reach her">
                <div className="flex flex-wrap gap-2">
                  <form action={sendSmsPrompt}>
                    <input type="hidden" name="householdId" value={h.id} />
                    <input type="hidden" name="caregiverId" value={c.id} />
                    <input type="hidden" name="template" value="checkin" />
                    <button className="btn btn-secondary">Text a strain check-in prompt</button>
                  </form>
                  <form action={sendSmsPrompt}>
                    <input type="hidden" name="householdId" value={h.id} />
                    <input type="hidden" name="caregiverId" value={c.id} />
                    <input type="hidden" name="template" value="reminder" />
                    <button className="btn btn-secondary">Text a visit reminder</button>
                  </form>
                </div>
                <p className="text-xs text-ink-3 mt-2">Texts go through the SMS adapter ({process.env.SMS_ADAPTER ?? "mock"}); see Integrations for the outbox. As of {asOf}.</p>
              </Section>
            </div>
          </div>
        );
      })}
    </div>
  );
}
