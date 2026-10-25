import Link from "next/link";
import { getRepository } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function Landing() {
  const repo = getRepository();
  const [hs, localities, asOf] = await Promise.all([repo.households(), repo.localities(), repo.asOf()]);
  const pilot = localities.filter((l) => l.pilotPhase > 0);
  const verified = hs.flatMap((h) => h.caregivers).filter((c) => c.identity.status === "verified").length;
  return (
    <div data-face="care" className="min-h-screen">
      <header className="max-w-5xl mx-auto px-6 pt-10 pb-6 flex items-baseline justify-between">
        <div className="display text-2xl">CareShare</div>
        <div className="text-sm text-ink-3">Pilot build · synthetic data · as of {asOf}</div>
      </header>
      <main className="max-w-5xl mx-auto px-6 pb-20">
        <section className="grid md:grid-cols-[1.2fr_1fr] gap-10 items-start">
          <div>
            <h1 className="text-4xl md:text-5xl leading-[1.08]">One shared record for the family caring for someone with dementia, and the local clinic that cares for them both.</h1>
            <p className="mt-6 text-lg text-ink-2 max-w-prose">
              In rural Virginia the memory specialist is two hours away and the family caregiver is the care manager by default, with no verified standing in anyone&rsquo;s system. CareShare gives her a verified, delegated seat on the care team and gives the rural primary care clinic a structured view of what she knows, so problems get caught at the kitchen table instead of the emergency department.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/care" className="btn btn-primary btn-lg">Open CareShare Caregiver</Link>
              <Link href="/clinic" className="btn btn-secondary btn-lg">Open the Clinic Console</Link>
            </div>
          </div>
          <aside className="card-soft">
            <h2>Two faces, one platform</h2>
            <dl className="mt-4 space-y-4 text-[0.95rem]">
              <div>
                <dt className="font-bold">CareShare Caregiver</dt>
                <dd className="text-ink-2">Identity verified to the federal standard (CLEAR or ID.me, in person at the clinic as the fallback). Then: the shared care plan, one medication list checked against Medicare pharmacy claims, a symptom log, visits and rides, messages to the clinic, check-ins on her own health, and the community resources listed in her county.</dd>
              </div>
              <div>
                <dt className="font-bold">CareShare Clinic Console</dt>
                <dd className="text-ink-2">For a rural FQHC or practice, no special program enrollment required. Confirm the caregiver once as the patient&rsquo;s representative, see the household roster by tier and cadence, work the escalation queue, read the monthly structured summary, and export the documentation for whatever the clinic bills after the pilot.</dd>
              </div>
            </dl>
          </aside>
        </section>

        <section className="mt-16 grid sm:grid-cols-3 gap-6">
          <div className="card">
            <div className="display text-3xl tnum">{hs.length}</div>
            <div className="text-sm text-ink-2 mt-1">synthetic households across {pilot.length} pilot localities</div>
          </div>
          <div className="card">
            <div className="display text-3xl tnum">{verified}</div>
            <div className="text-sm text-ink-2 mt-1">caregivers identity-verified at IAL2 (simulated)</div>
          </div>
          <div className="card">
            <div className="display text-3xl">{pilot.filter((l) => l.pilotPhase === 1).map((l) => l.name.replace(" County", "").replace(" City", "")).join(" · ")}</div>
            <div className="text-sm text-ink-2 mt-1">go-live localities; Henry, Martinsville and Mecklenburg follow</div>
          </div>
        </section>

        <section className="mt-16 grid md:grid-cols-2 gap-10">
          <div className="prose">
            <h2>What this build proves</h2>
            <p className="mt-3 text-ink-2">
              It is the baseline for a Rural Health Transformation application: a consumer-facing health technology for a defined chronic disease, built for Appendix A localities, with the trust layer already working and the care model drawn from published, validated dementia care-management requirements rather than invented here.
            </p>
            <ul className="mt-4 space-y-2 text-ink-2 list-disc pl-5">
              <li>Verified caregiver identity and one-time proxy confirmation replace per-provider paper forms.</li>
              <li>The caregiver&rsquo;s own health is measured too: strain, a depression screen, home blood pressure, her own primary care visit.</li>
              <li>Medication discrepancies surface from Medicare claims the clinic cannot otherwise see.</li>
              <li>Community referrals close the loop back to the directory partner.</li>
              <li>Every outcome measure the pilot reports is computed from the record, by locality.</li>
            </ul>
          </div>
          <div className="prose">
            <h2>What is real and what is not</h2>
            <p className="mt-3 text-ink-2">
              Every person, clinic, phone number and listing here is invented. Identity verification, Medicare records, the EHR and text messages run in mock mode by default; each has a live adapter behind an environment switch (CLEAR and ID.me sandboxes, Blue Button 2.0, FHIR R4). The localities are real because the pilot plan names them.
            </p>
            <p className="mt-3 text-ink-2">
              Built by Vivid Solutions, Herndon, Virginia. <Link href="/clinic/integrations" className="underline">Integration status</Link>.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
