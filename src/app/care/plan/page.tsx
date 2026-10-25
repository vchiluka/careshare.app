import Link from "next/link";
import { Pill } from "@/components/ui";
import { CADENCE_LABEL, fmtDate, TIER_LABELS } from "@/lib/engine";
import { requireCare } from "@/lib/services/care-context";

export const dynamic = "force-dynamic";

const ownerLabel = { caregiver: "You", clinic: "Clinic", shared: "Together" };

export default async function CarePlanPage() {
  const { view } = await requireCare({ needRecord: true });
  const { h, site, staffById } = view;
  const plan = h.carePlan;
  const reviewer = plan.reviewedBy ? staffById[plan.reviewedBy]?.name : undefined;
  return (
    <div>
      <h1>{h.patient.givenName}&rsquo;s care plan</h1>
      <p className="mt-2 text-ink-2">
        Written with {site.orgName}
        {reviewer ? `, last reviewed ${fmtDate(plan.reviewedOn)} by ${reviewer}` : ""}. <Link href="/care/summary" className="underline">Print a one-page copy</Link> to keep on the fridge or take to any appointment.
      </p>

      <div className="card mt-6">
        <h2>How closely the clinic stays in touch</h2>
        {plan.tier ? (
          <p className="mt-2 text-ink-2">
            {h.patient.givenName}&rsquo;s stage and how things are going for you put this household in the <strong>{TIER_LABELS[plan.tier].toLowerCase()}</strong> group, so the clinic plans to be in touch <strong>{CADENCE_LABEL[plan.tier]}</strong>. That changes as things change; your check-ins are part of how.
          </p>
        ) : (
          <p className="mt-2 text-ink-2">The clinic has not finished the first assessment yet.</p>
        )}
      </div>

      <div className="card mt-5">
        <h2>Goals</h2>
        <ul className="mt-3 divide-y divide-rule">
          {plan.goals.map((g) => (
            <li key={g.id} className="py-3 flex items-start gap-3">
              <span className={`mt-1 h-5 w-5 shrink-0 rounded-full border-2 ${g.status === "met" ? "bg-green border-green" : g.status === "dropped" ? "border-rule bg-paper-2" : "border-accent"}`} aria-label={g.status} />
              <div className="flex-1">
                <div className={g.status !== "active" ? "text-ink-3 line-through" : ""}>{g.text}</div>
                <div className="text-sm text-ink-3 mt-0.5">
                  {ownerLabel[g.owner]}
                  {g.dueOn ? ` · by ${fmtDate(g.dueOn)}` : ""}
                </div>
              </div>
              {g.status === "met" && <Pill kind="green">Done</Pill>}
            </li>
          ))}
          {plan.goals.length === 0 && <li className="py-3 text-ink-3">No goals written yet.</li>}
        </ul>
      </div>

      <div className="grid md:grid-cols-2 gap-5 mt-5">
        <div className="card">
          <h2>Watch for</h2>
          <ul className="mt-3 space-y-2 list-disc pl-5 text-ink-2">
            {plan.watchFor.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
        <div className="card">
          <h2>Respite and backup</h2>
          <p className="mt-3 text-ink-2">{plan.respiteArrangement ?? "No respite arranged yet. Ask about it at the next contact, or look under Help nearby."}</p>
          <h3 className="mt-5">Who to call</h3>
          <ul className="mt-2 space-y-1.5">
            {plan.whoToCall.map((w) => (
              <li key={w.label} className="flex justify-between gap-3">
                <span className="text-ink-2">{w.label}</span>
                <a href={`tel:${w.phone}`} className="font-bold tnum">
                  {w.phone}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="card mt-5">
        <h2>Diagnoses on the record</h2>
        <ul className="mt-3 space-y-1 text-ink-2">
          {h.patient.diagnoses.map((d) => (
            <li key={d.code}>
              {d.display} <span className="text-ink-3 text-sm">({d.code})</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
