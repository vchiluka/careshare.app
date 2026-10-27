import { caregiverReferral } from "@/app/actions";
import { Pill } from "@/components/ui";
import { fmtDate } from "@/lib/engine";
import { redirect } from "next/navigation";
import { requireCare } from "@/lib/services/care-context";
import { getCaregiverSession } from "@/lib/session";
import { getRepository } from "@/lib/store";
import type { Household, ResourceCategory } from "@/lib/domain/types";

export const dynamic = "force-dynamic";

const CAT: Record<ResourceCategory, string> = { respite: "Respite (a break for you)", adult_day: "Adult day programs", transport: "Rides", meals: "Meals", caregiver_support: "Caregiver support groups", home_care: "In-home help", legal_financial: "Legal and paperwork", memory_cafe: "Memory cafés", behavioral_health: "Counseling for you" };
const STATUS: Record<string, [string, "neutral" | "green" | "amber" | "blue"]> = { suggested: ["Suggested", "blue"], contacted: ["You called", "amber"], enrolled: ["Using it", "green"], declined: ["Not for us", "neutral"], not_reached: ["Could not reach", "amber"], closed: ["Finished", "neutral"] };

export default async function CareResources() {
  // Open before a record exists: a self-registered caregiver sees her own county's listings, read-only.
  const s = await getCaregiverSession();
  if (!s) redirect("/care");
  let h: Household | undefined;
  let fips: string;
  let localityName: string;
  let resources;
  if (s.householdId) {
    const { view } = await requireCare({ needRecord: true });
    h = view.h;
    fips = h.patient.localityFips;
    localityName = view.locality.name;
    resources = Object.values(view.resourcesById);
  } else {
    const repo = getRepository();
    const [a, localities, rs] = await Promise.all([s.accountId ? repo.account(s.accountId) : undefined, repo.localities(), repo.resources()]);
    if (!a) redirect("/care");
    fips = a.localityFips;
    localityName = localities.find((l) => l.fips === fips)?.name ?? fips;
    resources = rs;
  }
  const local = resources.filter((r) => r.localityFips.includes(fips));
  const byCat = new Map<ResourceCategory, typeof local>();
  for (const r of local) byCat.set(r.category, [...(byCat.get(r.category) ?? []), r]);
  const refByResource = new Map((h?.referrals ?? []).map((r) => [r.resourceId, r]));
  const locality = { name: localityName };
  return (
    <div>
      <h1>Help nearby</h1>
      <p className="mt-2 text-ink-2">
        What is listed for {locality.name} in Virginia&rsquo;s statewide directory of aging and caregiving services. Tell us what happened when you called, so the clinic knows and so the directory learns what works out here.
      </p>
      {[...byCat.entries()].map(([cat, rs]) => (
        <section key={cat} className="mt-8">
          <h2>{CAT[cat]}</h2>
          <ul className="mt-3 space-y-3">
            {rs.map((r) => {
              const ref = refByResource.get(r.id);
              return (
                <li key={r.id} className="card">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xl font-bold">{r.name}</div>
                      <div className="text-ink-2">{r.summary}</div>
                      <div className="mt-1 text-sm text-ink-3">
                        Listed in {r.directory.source === "virginianavigator_mock" ? "VirginiaNavigator" : r.directory.source} · {r.directory.listingId}
                      </div>
                    </div>
                    <a href={`tel:${r.phone}`} className="text-xl font-bold tnum shrink-0">
                      {r.phone}
                    </a>
                  </div>
                  {h && (
                  <form action={caregiverReferral} className="mt-3 flex flex-wrap items-center gap-2">
                    <input type="hidden" name="resourceId" value={r.id} />
                    {ref && <input type="hidden" name="referralId" value={ref.id} />}
                    {ref && (
                      <Pill kind={STATUS[ref.status][1]}>
                        {STATUS[ref.status][0]} · {fmtDate(ref.updatedOn)}
                      </Pill>
                    )}
                    <select name="status" className="input" defaultValue={ref?.status ?? "contacted"}>
                      <option value="contacted">I called them</option>
                      <option value="enrolled">We are using it</option>
                      <option value="not_reached">Could not reach them</option>
                      <option value="declined">Not for us</option>
                    </select>
                    <input name="note" className="input flex-1 min-w-40" placeholder="Anything to add" />
                    <button className="btn btn-secondary">Update</button>
                  </form>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
