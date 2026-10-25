import Link from "next/link";
import { resetDemo } from "@/app/actions";
import { Pill, Section, Stat, TierPill, severityTone } from "@/components/ui";
import { fmtDate } from "@/lib/engine";
import { requireClinic } from "@/lib/services/clinic-context";
import { loadRoster } from "@/lib/services/household-view";

export const dynamic = "force-dynamic";

export default async function ClinicToday() {
  await requireClinic();
  const { rows, asOf } = await loadRoster();
  const active = rows.filter((r) => r.h.status === "active");
  const critical = rows.flatMap((r) => r.signals.filter((s) => s.severity === "critical").map((s) => ({ r, s })));
  const warnings = rows.flatMap((r) => r.signals.filter((s) => s.severity === "warning")).length;
  const proxyQueue = rows.flatMap((r) => r.h.caregivers.filter((c) => c.identity.status === "verified" && c.proxy.status === "requested")).length;
  const inPerson = rows.flatMap((r) => r.h.caregivers.filter((c) => c.identity.status === "in_person_pending" || c.identity.status === "failed")).length;
  const dueToday = rows.filter((r) => r.cadence.state === "due_soon" || r.cadence.state === "overdue");
  const verified = rows.flatMap((r) => r.h.caregivers).filter((c) => c.identity.status === "verified").length;
  const allCg = rows.flatMap((r) => r.h.caregivers).length;
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <h1>Today, {fmtDate(asOf)}</h1>
        <form action={resetDemo}>
          <button className="btn btn-quiet text-xs">Reset demo data</button>
        </form>
      </div>
      <p className="mt-1 text-ink-2">What the care team should touch today, across every household the clinic looks after.</p>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-6 mt-8">
        <Stat label="active households" value={active.length} sub={`${rows.length} enrolled or in progress`} />
        <Stat label="call today" value={critical.length} tone={critical.length ? "red" : undefined} sub="critical signals" />
        <Stat label="to work this week" value={warnings} tone={warnings ? "amber" : undefined} sub="warnings" />
        <Stat label="awaiting your confirmation" value={proxyQueue} tone={proxyQueue ? "amber" : undefined} sub="verified caregivers, proxy not confirmed" />
        <Stat label="caregivers verified" value={`${verified}/${allCg}`} sub={inPerson ? `${inPerson} need in-person verification` : "identity at IAL2"} />
      </div>

      <Section title="Call today" aside={<Link href="/clinic/escalations" className="text-sm underline">Full queue</Link>}>
        {critical.length === 0 ? (
          <p className="text-sm text-ink-3">No critical signals.</p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Household</th>
                <th>Signal</th>
                <th>Do next</th>
              </tr>
            </thead>
            <tbody>
              {critical.map(({ r, s }) => (
                <tr key={r.h.id + s.key} className="row-link">
                  <td>
                    <Link href={`/clinic/households/${r.h.id}`} className="font-semibold">
                      {r.h.patient.familyName}, {r.h.patient.givenName}
                    </Link>
                    <div className="text-xs text-ink-3">
                      {r.localityName} · <TierPill tier={r.h.carePlan.tier} />
                    </div>
                  </td>
                  <td>
                    <Pill kind={severityTone(s.severity)}>{s.rule.replaceAll("_", " ").toLowerCase()}</Pill>
                    <div className="mt-1">{s.message}</div>
                  </td>
                  <td className="text-ink-2">{s.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <div className="grid md:grid-cols-2 gap-8">
        <Section title="Contacts due" aside={<span className="text-sm text-ink-3">{dueToday.length}</span>}>
          <ul className="divide-y divide-rule">
            {dueToday.slice(0, 12).map((r) => (
              <li key={r.h.id} className="py-2 flex items-center justify-between gap-3 text-sm">
                <Link href={`/clinic/households/${r.h.id}?tab=contacts`} className="font-semibold">
                  {r.h.patient.familyName}, {r.h.patient.givenName}
                </Link>
                <span className="text-ink-3">
                  {r.cadence.state === "overdue" ? <Pill kind="amber">{r.cadence.daysOverdue}d overdue</Pill> : <Pill kind="blue">due {fmtDate(r.cadence.nextDueOn)}</Pill>}
                </span>
              </li>
            ))}
            {dueToday.length === 0 && <li className="py-2 text-sm text-ink-3">Everyone is within cadence.</li>}
          </ul>
        </Section>
        <Section title="Access to open" aside={<Link href="/clinic/proxy" className="text-sm underline">Work the queue</Link>}>
          <ul className="divide-y divide-rule text-sm">
            {rows
              .flatMap((r) => r.h.caregivers.map((c) => ({ r, c })))
              .filter(({ c }) => (c.identity.status === "verified" && c.proxy.status === "requested") || c.identity.status === "in_person_pending")
              .slice(0, 12)
              .map(({ r, c }) => (
                <li key={c.id} className="py-2 flex items-center justify-between gap-3">
                  <span>
                    <strong>
                      {c.givenName} {c.familyName}
                    </strong>{" "}
                    for {r.h.patient.givenName} {r.h.patient.familyName}
                  </span>
                  {c.identity.status === "verified" ? <Pill kind="amber">confirm proxy</Pill> : <Pill kind="blue">in-person verification</Pill>}
                </li>
              ))}
          </ul>
        </Section>
      </div>
    </div>
  );
}
