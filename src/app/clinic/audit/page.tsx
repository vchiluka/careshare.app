import Link from "next/link";
import { requireClinic } from "@/lib/services/clinic-context";
import { getRepository } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function Audit() {
  await requireClinic();
  const log = await getRepository().auditLog({ limit: 300 });
  return (
    <div>
      <h1>Evidence trail</h1>
      <p className="mt-1 text-ink-2 max-w-3xl">Append-only. Every action records who, what and a reference id, never clinical content. Identity events record the vendor&rsquo;s subject reference and assurance evidence, not token payloads. Seeded history is not audited; everything since this process started is.</p>
      <table className="data mt-6">
        <thead>
          <tr>
            <th>When (UTC)</th>
            <th>Actor</th>
            <th>Action</th>
            <th>Household</th>
            <th>Reference</th>
          </tr>
        </thead>
        <tbody>
          {log.map((a) => (
            <tr key={a.id}>
              <td className="tnum text-ink-3">{a.at.replace("T", " ").slice(0, 19)}</td>
              <td>{a.actor}</td>
              <td>
                {a.action}
                {a.detail && <div className="text-xs text-ink-3">{a.detail}</div>}
              </td>
              <td>{a.householdId ? <Link href={`/clinic/households/${a.householdId}`} className="underline">{a.householdId}</Link> : ""}</td>
              <td className="text-ink-3 text-xs">{a.reference}</td>
            </tr>
          ))}
          {log.length === 0 && (
            <tr>
              <td colSpan={5} className="text-ink-3">No events yet.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
