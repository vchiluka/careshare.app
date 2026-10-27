import Link from "next/link";
import { approveStaff, assignLead } from "@/app/actions";
import { Empty, Pill, Section, TierPill } from "@/components/ui";
import { ROLE_LABEL } from "@/lib/domain/labels";
import { CLINICAL_LEAD_ROLES, type StaffRole, type StaffUser } from "@/lib/domain/types";
import { fmtDate } from "@/lib/engine";
import { requireClinic } from "@/lib/services/clinic-context";
import { loadRoster } from "@/lib/services/household-view";

export const dynamic = "force-dynamic";

/** Administration: approve staff who signed in through CLEAR/ID.me, and assign each household a clinical lead. */
export default async function Admin({ searchParams }: PageProps<"/clinic/admin">) {
  const me = await requireClinic({ admin: true });
  const sp = await searchParams;
  const focus = typeof sp.household === "string" ? sp.household : "";
  const { rows, sites, staff } = await loadRoster();
  const leads = staff.filter((s) => s.status === "active" && CLINICAL_LEAD_ROLES.includes(s.role));
  const pending = staff.filter((s) => s.status === "pending");
  const unassigned = rows.filter((r) => !r.h.assignedLeadStaffId && r.h.status !== "closed");
  const assigned = rows.filter((r) => r.h.assignedLeadStaffId);
  const siteName = (id: string) => sites.find((s) => s.id === id)?.town ?? id;
  const byLead = new Map<string, typeof rows>();
  for (const r of assigned) byLead.set(r.h.assignedLeadStaffId!, [...(byLead.get(r.h.assignedLeadStaffId!) ?? []), r]);
  const focusRow = focus ? rows.find((r) => r.h.id === focus) : undefined;

  return (
    <div>
      <h1>Administration</h1>
      <p className="mt-1 text-ink-2">Signed in as {me.name}, administrator. Approvals and assignments are written to the evidence trail.</p>

      {focusRow && (
        <Section title={`Assign a clinical lead: ${focusRow.h.patient.givenName} ${focusRow.h.patient.familyName}`}>
          <div className="card">
            <div className="text-sm text-ink-2 mb-3">
              {focusRow.localityName} · {focusRow.siteName} · <TierPill tier={focusRow.h.carePlan.tier} /> · current lead: {focusRow.h.assignedLeadStaffId ? staff.find((s) => s.id === focusRow.h.assignedLeadStaffId)?.name : "none"}
            </div>
            <AssignForm householdId={focusRow.h.id} current={focusRow.h.assignedLeadStaffId} siteId={focusRow.h.siteId} leads={leads} siteName={siteName} />
            <Link href={`/clinic/households/${focusRow.h.id}`} className="text-sm underline mt-3 inline-block">
              Back to the household
            </Link>
          </div>
        </Section>
      )}

      <Section title={`Staff awaiting approval (${pending.length})`}>
        {pending.length === 0 ? (
          <Empty>No one is waiting. Staff who sign in with CLEAR or ID.me for the first time appear here.</Empty>
        ) : (
          <div className="space-y-3">
            {pending.map((s) => (
              <form key={s.id} action={approveStaff} className="card">
                <input type="hidden" name="staffId" value={s.id} />
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <span className="font-semibold">{s.name}</span>
                    {s.email && <span className="text-ink-3 text-sm"> · {s.email}</span>}
                  </div>
                  <span className="text-xs text-ink-3">
                    Verified {s.identity ? `${fmtDate(s.identity.verifiedOn)} via ${s.identity.provider === "clear" ? "CLEAR" : "ID.me"} at ${s.identity.assurance}` : "—"}
                  </span>
                </div>
                <div className="grid sm:grid-cols-4 gap-3 mt-3">
                  <label className="field">
                    <span>Role</span>
                    <select name="role" defaultValue={s.role}>
                      {(Object.keys(ROLE_LABEL) as StaffRole[]).map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABEL[r]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Site</span>
                    <select name="siteId" defaultValue={s.siteId}>
                      {sites.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.town}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Credentials</span>
                    <input name="credentials" defaultValue={s.credentials ?? ""} placeholder="RN" />
                  </label>
                  <label className="flex items-end gap-2 pb-2 text-sm">
                    <input type="checkbox" name="isAdmin" /> administrator
                  </label>
                </div>
                <div className="flex gap-2 mt-3">
                  <button className="btn btn-primary" name="decision" value="approve">
                    Approve
                  </button>
                  <button className="btn btn-danger" name="decision" value="disable">
                    Decline
                  </button>
                </div>
              </form>
            ))}
          </div>
        )}
      </Section>

      <Section title={`Households without a clinical lead (${unassigned.length})`}>
        {unassigned.length === 0 ? (
          <Empty>Every open household has a lead.</Empty>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Patient</th>
                <th>Caregiver</th>
                <th>Locality / site</th>
                <th>Enrolled</th>
                <th>Assign</th>
              </tr>
            </thead>
            <tbody>
              {unassigned.map((r) => (
                <tr key={r.h.id}>
                  <td>
                    <Link href={`/clinic/households/${r.h.id}`} className="font-semibold">
                      {r.h.patient.familyName}, {r.h.patient.givenName}
                    </Link>
                    <div className="text-xs text-ink-3">
                      <TierPill tier={r.h.carePlan.tier} /> {r.h.origin === "self_registered" ? "· self-registered" : ""}
                    </div>
                  </td>
                  <td className="text-sm">{r.primary ? `${r.primary.givenName} ${r.primary.familyName}` : <span className="text-ink-3">none</span>}</td>
                  <td className="text-sm">
                    {r.localityName}
                    <div className="text-xs text-ink-3">{r.siteName}</div>
                  </td>
                  <td className="text-sm tnum">{fmtDate(r.h.enrolledOn)}</td>
                  <td>
                    <AssignForm householdId={r.h.id} siteId={r.h.siteId} leads={leads} siteName={siteName} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section title="Caseload by clinical lead">
        <div className="grid md:grid-cols-2 gap-4">
          {leads.map((l) => {
            const hs = byLead.get(l.id) ?? [];
            return (
              <div key={l.id} className="card">
                <div className="flex items-baseline justify-between">
                  <div>
                    <div className="font-semibold">{l.name}</div>
                    <div className="text-xs text-ink-3">
                      {ROLE_LABEL[l.role]} · {siteName(l.siteId)}
                    </div>
                  </div>
                  <Link href={`/clinic/households?lead=${l.id}`} className="text-sm underline tnum">
                    {hs.length} household{hs.length === 1 ? "" : "s"}
                  </Link>
                </div>
                <ul className="mt-3 text-sm divide-y divide-rule">
                  {hs.slice(0, 8).map((r) => (
                    <li key={r.h.id} className="py-1.5 flex items-center justify-between gap-2">
                      <Link href={`/clinic/households/${r.h.id}`}>
                        {r.h.patient.familyName}, {r.h.patient.givenName}
                      </Link>
                      <details className="text-xs">
                        <summary className="cursor-pointer text-ink-3">reassign</summary>
                        <div className="mt-2">
                          <AssignForm householdId={r.h.id} current={l.id} siteId={r.h.siteId} leads={leads} siteName={siteName} />
                        </div>
                      </details>
                    </li>
                  ))}
                  {hs.length > 8 && <li className="py-1.5 text-ink-3">and {hs.length - 8} more</li>}
                </ul>
              </div>
            );
          })}
        </div>
      </Section>

      <Section title="All staff">
        <table className="data">
          <thead>
            <tr>
              <th>Name</th>
              <th>Role</th>
              <th>Site</th>
              <th>Status</th>
              <th>Sign-in</th>
            </tr>
          </thead>
          <tbody>
            {staff.map((s) => (
              <tr key={s.id}>
                <td className="font-semibold">
                  {s.name}
                  {s.isAdmin && <span className="text-xs text-ink-3"> · admin</span>}
                </td>
                <td className="text-sm">{ROLE_LABEL[s.role]}</td>
                <td className="text-sm">{siteName(s.siteId)}</td>
                <td>
                  <Pill kind={s.status === "active" ? "green" : s.status === "pending" ? "amber" : "neutral"}>{s.status}</Pill>
                </td>
                <td className="text-xs text-ink-3">{s.identity ? `${s.identity.provider === "clear" ? "CLEAR" : "ID.me"} ${s.identity.assurance}` : "demo picker"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </div>
  );
}

function AssignForm({ householdId, current, siteId, leads, siteName }: { householdId: string; current?: string; siteId: string; leads: StaffUser[]; siteName: (id: string) => string }) {
  return (
    <form action={assignLead} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="householdId" value={householdId} />
      <select name="leadStaffId" defaultValue={current ?? ""} className="input">
        <option value="">No lead</option>
        {leads.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name} ({ROLE_LABEL[l.role]}, {siteName(l.siteId)}){l.siteId !== siteId ? " – other site" : ""}
          </option>
        ))}
      </select>
      <label className="text-xs text-ink-3 flex items-center gap-1">
        <input type="checkbox" name="moveSite" /> move household to lead&rsquo;s site
      </label>
      <button className="btn btn-secondary">Assign</button>
    </form>
  );
}
