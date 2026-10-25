import { Meter, Section, Stat, TierPill } from "@/components/ui";
import { fmtDate, outcomeReport, type Measure } from "@/lib/engine";
import type { CareTier } from "@/lib/domain/types";
import { requireClinic } from "@/lib/services/clinic-context";
import { getRepository } from "@/lib/store";

export const dynamic = "force-dynamic";

const KPO: Record<string, string> = {
  people: "People served",
  "1": "KPO 1 · Decrease rates of chronic disease in rural adults",
  "2": "KPO 2 · Increase access to primary care, including preventive visits",
  "3": "KPO 3 · Modernize provider operations and adopt technology in rural communities",
};

function fmt(m: Measure) {
  if (m.value === null) return "—";
  if (m.unit === "%") return `${m.value}%`;
  if (m.unit === "pts") return `${m.value > 0 ? "+" : ""}${m.value}`;
  if (m.unit === "per100") return `${m.value}`;
  if (m.unit === "days") return `${m.value} d`;
  return String(m.value);
}

export default async function Outcomes() {
  await requireClinic();
  const repo = getRepository();
  const [hs, localities, asOf] = await Promise.all([repo.households(), repo.localities(), repo.asOf()]);
  const r = outcomeReport(hs, localities, asOf);
  const groups = ["people", "1", "2", "3"];
  const headline = (id: string) => r.measures.find((m) => m.id === id)!;
  return (
    <div>
      <h1>Pilot outcomes</h1>
      <p className="mt-1 text-ink-2 max-w-3xl">
        Every measure is computed from the record, by Appendix A locality, as of {fmtDate(asOf)}. These are the six-month measures the pilot reports; the definitions are written next to each so a reviewer, or the evaluator, can recompute them.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-8">
        <Stat label="households active" value={headline("active").value ?? 0} sub={`${headline("households").value} enrolled`} />
        <Stat label="caregivers verified" value={fmt(headline("verified"))} sub="IAL2, any route" />
        <Stat label="med reconciliation current" value={fmt(headline("recon"))} sub="last 90 days" />
        <Stat label="caregiver strain change" value={fmt(headline("zbi"))} sub={`ZBI-12 points, n=${headline("zbi").denominator ?? 0}`} tone={(headline("zbi").value ?? 0) < 0 ? "green" : undefined} />
      </div>

      {groups.map((g) => (
        <Section key={g} title={KPO[g]}>
          <table className="data">
            <thead>
              <tr>
                <th className="w-1/3">Measure</th>
                <th>Value</th>
                <th className="w-1/3"></th>
                <th>Definition</th>
              </tr>
            </thead>
            <tbody>
              {r.measures
                .filter((m) => String(m.kpo) === g)
                .map((m) => (
                  <tr key={m.id}>
                    <td className="font-semibold">{m.label}</td>
                    <td className="tnum text-lg">
                      {fmt(m)}
                      {m.numerator !== undefined && m.denominator !== undefined && (
                        <div className="text-xs text-ink-3 font-normal">
                          {m.numerator} of {m.denominator}
                        </div>
                      )}
                    </td>
                    <td>{m.unit === "%" && m.value !== null ? <Meter value={m.value} max={100} tone={m.value >= 70 ? "green" : m.value >= 40 ? "amber" : "red"} /> : null}</td>
                    <td className="text-xs text-ink-2">{m.definition}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </Section>
      ))}

      <div className="grid md:grid-cols-2 gap-8">
        <Section title="By locality">
          <table className="data">
            <thead>
              <tr>
                <th>Locality</th>
                <th>Households</th>
                <th>Active</th>
                <th>Verified caregivers</th>
              </tr>
            </thead>
            <tbody>
              {r.byLocality.map((l) => (
                <tr key={l.fips}>
                  <td>
                    {l.name} {l.appendixA && <span className="text-xs text-ink-3">· Appendix A</span>}
                  </td>
                  <td className="tnum">{l.households}</td>
                  <td className="tnum">{l.active}</td>
                  <td className="tnum">{l.verifiedCaregivers}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
        <Section title="Active households by tier">
          <ul className="space-y-2">
            {Object.entries(r.byTier)
              .sort((a, b) => b[1] - a[1])
              .map(([t, n]) => (
                <li key={t} className="flex items-center justify-between text-sm">
                  <TierPill tier={t === "unset" ? null : (t as CareTier)} />
                  <span className="tnum">{n}</span>
                </li>
              ))}
          </ul>
          <p className="text-xs text-ink-3 mt-4">Tier mix shapes staffing: weekly contact for high-strain households, twice monthly for moderate/severe stage, monthly for the rest.</p>
        </Section>
      </div>
    </div>
  );
}
