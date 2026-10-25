import { ageOn, fmtDate, sortMedications, TIER_LABELS } from "@/lib/engine";
import { requireCare } from "@/lib/services/care-context";

export const dynamic = "force-dynamic";

/** One printable page: the rural modification for the kitchen fridge and the ER triage desk. */
export default async function PrintableSummary() {
  const { view, me } = await requireCare({ needRecord: true });
  const { h, asOf, site } = view;
  const meds = sortMedications(h.medications).filter((m) => m.status === "active");
  return (
    <div className="max-w-2xl">
      <div className="no-print flex items-center justify-between">
        <h1>Care summary to print</h1>
        <span className="text-sm text-ink-3">Use your browser&rsquo;s print command</span>
      </div>
      <article className="card mt-4 text-[15px] leading-snug">
        <header className="flex justify-between border-b border-rule pb-3">
          <div>
            <div className="display text-2xl">
              {h.patient.givenName} {h.patient.familyName}
            </div>
            <div>
              Born {fmtDate(h.patient.birthDate)} (age {ageOn(h.patient.birthDate, asOf)}) · Medicare{h.patient.coverage.medicaid ? " and Medicaid" : ""}
            </div>
          </div>
          <div className="text-right text-sm">
            <div>CareShare summary</div>
            <div>{fmtDate(asOf)}</div>
          </div>
        </header>
        <section className="mt-3">
          <h3>Diagnoses</h3>
          <p>{h.patient.diagnoses.map((d) => d.display).join("; ")}.</p>
          {h.carePlan.tier && <p className="mt-1">Care plan group: {TIER_LABELS[h.carePlan.tier]}.</p>}
        </section>
        <section className="mt-3">
          <h3>Current medications</h3>
          <ul className="columns-2 gap-6">
            {meds.map((m) => (
              <li key={m.id} className="capitalize">
                {m.name} {m.strength} <span className="normal-case text-ink-2">— {m.sig}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="mt-3">
          <h3>Primary caregiver and representative</h3>
          <p>
            {me.givenName} {me.familyName} ({me.relationship.replaceAll("_", " ")}), {me.phone}. Identity verified {fmtDate(me.identity.verifiedOn)}; confirmed as representative by {site.orgName} on {fmtDate(me.proxy.confirmedOn)}.
          </p>
        </section>
        <section className="mt-3">
          <h3>Primary care</h3>
          <p>
            {site.name}, {site.phone}. Watch for: {h.carePlan.watchFor.join("; ").toLowerCase()}.
          </p>
        </section>
        <section className="mt-3">
          <h3>Active goals</h3>
          <ul className="list-disc pl-5">
            {h.carePlan.goals.filter((g) => g.status === "active").map((g) => (
              <li key={g.id}>{g.text}</li>
            ))}
          </ul>
        </section>
        <footer className="mt-4 pt-2 border-t border-rule text-xs text-ink-3">Synthetic record for demonstration. In the pilot this page is also available as a scannable link for the receiving clinic.</footer>
      </article>
    </div>
  );
}
