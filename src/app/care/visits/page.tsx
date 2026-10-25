import { caregiverTransportRequest } from "@/app/actions";
import { Pill } from "@/components/ui";
import { fmtDate, labelPurpose } from "@/lib/engine";
import { requireCare } from "@/lib/services/care-context";

export const dynamic = "force-dynamic";

export default async function CareVisits() {
  const { view } = await requireCare({ needRecord: true });
  const { h, asOf, resourcesById } = view;
  const upcoming = h.appointments.filter((a) => a.status === "scheduled" && a.date >= asOf).sort((a, b) => a.date.localeCompare(b.date));
  const past = h.appointments.filter((a) => !(a.status === "scheduled" && a.date >= asOf)).sort((a, b) => b.date.localeCompare(a.date));
  const rides = Object.values(resourcesById).filter((r) => r.category === "transport" && r.localityFips.includes(h.patient.localityFips));
  return (
    <div>
      <h1>Visits and rides</h1>
      <p className="mt-2 text-ink-2">Getting there is half the visit out here. If you need a ride, say so and the clinic will book one.</p>

      <h2 className="mt-8">Coming up</h2>
      <ul className="mt-3 space-y-3">
        {upcoming.map((a) => (
          <li key={a.id} className="card">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-xl font-bold">
                  {fmtDate(a.date)}
                  {a.time ? `, ${a.time}` : ""}
                </div>
                <div className="text-ink-2 capitalize">{a.forPerson === "caregiver" ? "Your own visit" : labelPurpose(a.purpose)}</div>
                <div className="text-ink-2">
                  {a.withName} · {a.location}
                </div>
              </div>
              <div className="text-right">
                {a.forPerson === "patient" && (a.transport.needed ? a.transport.arranged ? <Pill kind="green">Ride arranged: {a.transport.provider}</Pill> : <Pill kind="amber">Ride requested, not yet arranged</Pill> : (
                  <form action={caregiverTransportRequest}>
                    <input type="hidden" name="appointmentId" value={a.id} />
                    <button className="btn btn-secondary">I need a ride</button>
                  </form>
                ))}
              </div>
            </div>
          </li>
        ))}
        {upcoming.length === 0 && <li className="text-ink-3">No upcoming visits.</li>}
      </ul>

      <div className="card-soft mt-8">
        <h2>Ride services in {view.locality.name}</h2>
        <ul className="mt-3 space-y-2">
          {rides.map((r) => (
            <li key={r.id} className="flex flex-wrap justify-between gap-2">
              <span>
                <strong>{r.name}</strong> <span className="text-ink-2">— {r.summary}</span>
              </span>
              <a href={`tel:${r.phone}`} className="font-bold tnum">
                {r.phone}
              </a>
            </li>
          ))}
          {rides.length === 0 && <li className="text-ink-3">None listed yet.</li>}
        </ul>
      </div>

      <h2 className="mt-10">Past</h2>
      <ul className="mt-3 divide-y divide-rule">
        {past.map((a) => (
          <li key={a.id} className="py-3 flex justify-between gap-3">
            <div>
              <span className="tnum">{fmtDate(a.date)}</span> <span className="capitalize text-ink-2">{labelPurpose(a.purpose)}</span> <span className="text-ink-3">· {a.withName}</span>
            </div>
            <Pill kind={a.status === "completed" ? "green" : a.status === "missed" ? "amber" : "neutral"}>{a.status}</Pill>
          </li>
        ))}
        {past.length === 0 && <li className="py-3 text-ink-3">No past visits on record.</li>}
      </ul>
    </div>
  );
}
