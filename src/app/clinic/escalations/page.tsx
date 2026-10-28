import Link from "next/link";
import { acknowledgeEscalation, resolveEscalation, snoozeEscalation } from "@/app/actions";
import { Pill, Section, severityTone, TierPill } from "@/components/ui";
import { fmtDate, isSnoozed } from "@/lib/engine";
import { requireClinic } from "@/lib/services/clinic-context";
import { loadRoster } from "@/lib/services/household-view";

export const dynamic = "force-dynamic";

export default async function Escalations({ searchParams }: PageProps<"/clinic/escalations">) {
  await requireClinic();
  const sp = await searchParams;
  const { rows, asOf } = await loadRoster();
  const rule = typeof sp.rule === "string" ? sp.rule : "";
  const showSnoozed = sp.snoozed === "1";
  const snoozedCount = rows.flatMap((r) => r.h.escalations.filter((e) => isSnoozed(e, asOf))).length;
  const items = rows
    .flatMap((r) => r.h.escalations.filter((e) => e.status !== "resolved" && (showSnoozed ? isSnoozed(e, asOf) : !isSnoozed(e, asOf))).map((e) => ({ r, e })))
    .filter(({ e }) => !rule || e.rule === rule)
    .sort((a, b) => ({ critical: 0, warning: 1, info: 2 })[a.e.severity] - ({ critical: 0, warning: 1, info: 2 })[b.e.severity] || a.e.raisedOn.localeCompare(b.e.raisedOn));
  const byRule = new Map<string, number>();
  for (const { e } of rows.flatMap((r) => r.h.escalations.filter((x) => x.status !== "resolved" && !isSnoozed(x, asOf)).map((e) => ({ e })))) byRule.set(e.rule, (byRule.get(e.rule) ?? 0) + 1);
  const resolved = rows.flatMap((r) => r.h.escalations.filter((e) => e.status === "resolved"));
  return (
    <div>
      <h1>Escalations</h1>
      <p className="mt-1 text-ink-2">Every open signal across the panel. Acknowledge to claim it, resolve with what was done, or snooze what can wait so the queue stays honest. Resolution time is a pilot measure.</p>
      {snoozedCount > 0 && (
        <p className="mt-1 text-sm text-ink-3">
          {snoozedCount} snoozed. <Link href={showSnoozed ? "/clinic/escalations" : "/clinic/escalations?snoozed=1"} className="underline">{showSnoozed ? "Back to the open queue" : "Show them"}</Link>
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-1.5">
        <Link href="/clinic/escalations" className={`btn ${rule ? "btn-quiet" : "btn-secondary"} text-xs`}>All ({items.length + (rule ? 0 : 0)})</Link>
        {[...byRule.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => (
          <Link key={k} href={`/clinic/escalations?rule=${k}`} className={`btn ${rule === k ? "btn-secondary" : "btn-quiet"} text-xs`}>
            {k.replaceAll("_", " ").toLowerCase()} ({n})
          </Link>
        ))}
      </div>
      <Section title="Open" aside={<span className="text-sm text-ink-3">{items.length} · {resolved.length} resolved so far</span>}>
        <table className="data">
          <thead>
            <tr>
              <th>Severity</th>
              <th>Household</th>
              <th>Signal</th>
              <th>Raised</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {items.map(({ r, e }) => (
              <tr key={e.id}>
                <td>
                  <Pill kind={severityTone(e.severity)}>{e.severity}</Pill>
                  {e.status === "acknowledged" && <div className="text-xs text-ink-3 mt-1">claimed</div>}
                </td>
                <td>
                  <Link href={`/clinic/households/${r.h.id}`} className="font-semibold">
                    {r.h.patient.familyName}, {r.h.patient.givenName}
                  </Link>
                  <div className="text-xs text-ink-3">
                    {r.localityName} · <TierPill tier={r.h.carePlan.tier} />
                  </div>
                </td>
                <td>
                  <div className="text-xs text-ink-3">{e.rule.replaceAll("_", " ").toLowerCase()}</div>
                  <div>{e.message}</div>
                  <div className="text-xs text-ink-2 mt-0.5">Next: {e.action}</div>
                </td>
                <td className="tnum text-ink-3">{fmtDate(e.raisedOn)}</td>
                <td>
                  <div className="flex flex-col gap-1.5 min-w-56">
                    {e.status === "open" && (
                      <form action={acknowledgeEscalation}>
                        <input type="hidden" name="householdId" value={r.h.id} />
                        <input type="hidden" name="escalationId" value={e.id} />
                        <button className="btn btn-secondary py-1 text-xs w-full">I have this</button>
                      </form>
                    )}
                    <form action={resolveEscalation} className="flex gap-1">
                      <input type="hidden" name="householdId" value={r.h.id} />
                      <input type="hidden" name="escalationId" value={e.id} />
                      <input name="resolution" className="input py-1 text-xs flex-1" placeholder="what was done" />
                      <button className="btn btn-primary py-1 text-xs">Resolve</button>
                    </form>
                    {e.severity !== "critical" && (
                      <form action={snoozeEscalation} className="flex gap-1 items-center">
                        <input type="hidden" name="householdId" value={r.h.id} />
                        <input type="hidden" name="escalationId" value={e.id} />
                        <select name="days" className="input py-1 text-xs" defaultValue="7">
                          <option value="3">3 days</option>
                          <option value="7">7 days</option>
                          <option value="14">14 days</option>
                          <option value="30">30 days</option>
                        </select>
                        <button className="btn btn-quiet py-1 text-xs">{isSnoozed(e, asOf) ? `Snoozed to ${fmtDate(e.snoozedUntil!)}; extend` : "Snooze"}</button>
                      </form>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={5} className="text-ink-3">Nothing open.</td>
              </tr>
            )}
          </tbody>
        </table>
      </Section>
    </div>
  );
}
