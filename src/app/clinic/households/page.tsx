import Link from "next/link";
import { Pill, TierPill } from "@/components/ui";
import { fmtDate } from "@/lib/engine";
import { requireClinic } from "@/lib/services/clinic-context";
import { loadRoster } from "@/lib/services/household-view";

export const dynamic = "force-dynamic";

export default async function Households({ searchParams }: PageProps<"/clinic/households">) {
  const me = await requireClinic();
  const sp = await searchParams;
  const { rows, localities, staff } = await loadRoster();
  const loc = typeof sp.locality === "string" ? sp.locality : "";
  const status = typeof sp.status === "string" ? sp.status : "";
  const lead = typeof sp.lead === "string" ? sp.lead : "";
  const filtered = rows.filter((r) => (!loc || r.h.patient.localityFips === loc) && (!status || r.h.status === status) && (!lead || (lead === "unassigned" ? !r.h.assignedLeadStaffId : r.h.assignedLeadStaffId === lead)));
  const staffById = Object.fromEntries(staff.map((s) => [s.id, s]));
  return (
    <div>
      <h1>Households</h1>
      <p className="mt-1 text-ink-2">Every patient and caregiver pair the clinic looks after, sorted by what needs attention.</p>
      <form className="mt-5 flex flex-wrap gap-3 items-end">
        <label className="field">
          <span>Locality</span>
          <select name="locality" defaultValue={loc}>
            <option value="">All</option>
            {localities.filter((l) => l.pilotPhase > 0).map((l) => (
              <option key={l.fips} value={l.fips}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Status</span>
          <select name="status" defaultValue={status}>
            <option value="">All</option>
            {["active", "enrolling", "invited", "paused", "closed"].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Clinical lead</span>
          <select name="lead" defaultValue={lead}>
            <option value="">All</option>
            <option value={me.id}>Mine</option>
            <option value="unassigned">Unassigned</option>
            {staff.filter((s) => s.status === "active" && s.id !== me.id && rows.some((r) => r.h.assignedLeadStaffId === s.id)).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <button className="btn btn-secondary">Filter</button>
        <span className="text-sm text-ink-3 ml-auto tnum">{filtered.length} households</span>
      </form>
      <table className="data mt-5">
        <thead>
          <tr>
            <th>Patient</th>
            <th>Caregiver</th>
            <th>Locality</th>
            <th>Lead</th>
            <th>Tier</th>
            <th>Cadence</th>
            <th>Signals</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((r) => {
            const c = r.primary;
            const crit = r.signals.filter((s) => s.severity === "critical").length;
            const warn = r.signals.filter((s) => s.severity === "warning").length;
            return (
              <tr key={r.h.id} className="row-link">
                <td>
                  <Link href={`/clinic/households/${r.h.id}`} className="font-semibold">
                    {r.h.patient.familyName}, {r.h.patient.givenName}
                  </Link>
                  <div className="text-xs text-ink-3">{r.h.patient.diagnoses[0]?.display}</div>
                </td>
                <td>
                  {c ? (
                    <>
                      <div>
                        {c.givenName} {c.familyName} <span className="text-ink-3">({c.relationship.replaceAll("_", " ")})</span>
                      </div>
                      <div className="mt-0.5 flex gap-1">
                        {c.identity.status === "verified" ? <Pill kind="green">verified</Pill> : <Pill kind={c.identity.status === "in_person_pending" || c.identity.status === "failed" ? "amber" : "neutral"}>{c.identity.status.replaceAll("_", " ")}</Pill>}
                        {c.identity.status === "verified" && (c.proxy.status === "confirmed" ? <Pill kind="green">proxy</Pill> : <Pill kind="amber">proxy {c.proxy.status}</Pill>)}
                      </div>
                    </>
                  ) : (
                    <span className="text-ink-3">Lives alone</span>
                  )}
                </td>
                <td className="text-ink-2">
                  {r.localityName}
                  {r.h.origin === "self_registered" && <div className="text-xs text-ink-3">self-registered</div>}
                </td>
                <td className="text-sm">{r.h.assignedLeadStaffId ? staffById[r.h.assignedLeadStaffId]?.name ?? r.h.assignedLeadStaffId : <Pill kind="amber">unassigned</Pill>}</td>
                <td>
                  <TierPill tier={r.h.carePlan.tier} />
                </td>
                <td>{r.cadence.state === "overdue" ? <Pill kind="amber">{r.cadence.daysOverdue}d overdue</Pill> : r.cadence.state === "due_soon" ? <Pill kind="blue">due soon</Pill> : r.cadence.state === "never_contacted" ? <Pill kind="amber">no contact</Pill> : r.cadence.state === "no_tier" ? <Pill>no tier</Pill> : <span className="text-xs text-ink-3">next {fmtDate(r.cadence.nextDueOn)}</span>}</td>
                <td>
                  <div className="flex gap-1">
                    {crit > 0 && <Pill kind="red">{crit} critical</Pill>}
                    {warn > 0 && <Pill kind="amber">{warn}</Pill>}
                    {crit + warn === 0 && <span className="text-xs text-ink-3">—</span>}
                  </div>
                </td>
                <td>
                  <Pill kind={r.h.status === "active" ? "green" : "neutral"}>{r.h.status}</Pill>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
