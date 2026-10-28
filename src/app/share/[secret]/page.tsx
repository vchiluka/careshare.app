import Link from "next/link";
import { Notice, Pill } from "@/components/ui";
import { fmtDate } from "@/lib/engine";
import { findShare } from "@/lib/services/share";
import { getRepository } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * Public viewer for a "share with a provider" link: a receptionist, ED nurse or adult day program opens the
 * URL from the QR code, enters the PIN the caregiver read out, and sees the current plan and medicine list.
 * Nothing renders without the PIN. The FHIR bundle is one more click.
 */
export default async function ShareViewer({ params, searchParams }: PageProps<"/share/[secret]">) {
  const { secret } = await params;
  const sp = await searchParams;
  const pin = typeof sp.pin === "string" ? sp.pin.trim() : undefined;
  const repo = getRepository();
  const probe = await findShare(await repo.households(), secret);
  const shell = (body: React.ReactNode) => (
    <div className="min-h-screen bg-paper">
      <header className="border-b border-rule bg-paper-2">
        <div className="max-w-3xl mx-auto px-5 py-4 flex items-center justify-between">
          <span className="display text-2xl">CareShare</span>
          <span className="text-sm text-ink-3">Shared care record</span>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-5 py-8">{body}</main>
    </div>
  );
  if (!probe.ok) {
    const msg = probe.reason === "expired" ? "This link has expired. Ask the family to share a new one." : probe.reason === "revoked" ? "The family withdrew this link." : "This link is not valid.";
    return shell(<Notice kind="amber">{msg}</Notice>);
  }
  if (!pin) {
    return shell(
      <div className="max-w-md">
        <h1>Enter the PIN</h1>
        <p className="mt-2 text-ink-2">The family member who shared this record has a six-digit PIN for you. The link is for {probe.link.label} and works until {new Date(probe.link.expiresAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}.</p>
        <form method="get" className="card mt-6 space-y-3">
          <label className="field">
            <span>PIN</span>
            <input name="pin" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required autoFocus />
          </label>
          <button className="btn btn-primary w-full">Open the record</button>
        </form>
      </div>,
    );
  }
  const res = await findShare(await repo.households(), secret, pin);
  if (!res.ok) {
    await repo.audit({ actor: "share:viewer", action: "share.pin_failed", householdId: probe.h.id, reference: probe.link.id });
    return shell(
      <div className="max-w-md">
        <Notice kind="amber">That PIN did not match. Check it with the family and try again.</Notice>
        <Link href={`/share/${secret}`} className="btn btn-secondary mt-4">Try again</Link>
      </div>,
    );
  }
  const { h, link } = res;
  const asOf = await repo.asOf();
  await repo.updateHousehold(h.id, (d) => {
    const l = (d.shares ?? []).find((x) => x.id === link.id);
    if (l) {
      l.opens += 1;
      l.lastOpenedAt = new Date().toISOString();
    }
  });
  await repo.audit({ actor: "share:viewer", action: "share.opened", householdId: h.id, reference: link.id });
  const sites = await repo.sites();
  const site = sites.find((s) => s.id === h.siteId);
  const cg = h.caregivers.find((c) => c.id === link.createdBy);
  const meds = h.medications.filter((m) => m.status !== "stopped");
  return shell(
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1>
          {h.patient.givenName} {h.patient.familyName}
        </h1>
        <Pill kind="blue">Shared {fmtDate(link.createdAt.slice(0, 10))} for {link.label}</Pill>
      </div>
      <p className="mt-1 text-ink-2">
        Born {fmtDate(h.patient.birthDate)} · {h.patient.diagnoses.map((d) => d.display).join("; ") || "no diagnosis recorded"} · {h.patient.coverage.medicaid ? "Medicare and Medicaid" : "Medicare"}
      </p>
      <p className="text-sm text-ink-3">
        Shared by {cg ? `${cg.givenName} ${cg.familyName} (${cg.relationship.replaceAll("_", " ")}, identity verified ${cg.identity.verifiedOn ?? ""}, authorization on file)` : "the family"}. Primary care: {site?.orgName ?? "partner clinic"}, {site?.phone ?? ""}. As of {fmtDate(asOf)}.
      </p>

      <section className="card mt-6">
        <h2>Medicines ({meds.length})</h2>
        <table className="data mt-3">
          <thead>
            <tr>
              <th>Medicine</th>
              <th>How taken</th>
              <th>Source</th>
              <th>Last fill</th>
            </tr>
          </thead>
          <tbody>
            {meds.map((m) => (
              <tr key={m.id}>
                <td className="font-semibold capitalize">
                  {m.name} {m.strength}
                </td>
                <td>{m.sig}</td>
                <td className="text-sm">{m.source === "medicare" ? "Medicare claims" : m.source === "caregiver" ? "Family reported" : "Clinic list"}{m.status === "unverified" ? " · not yet confirmed" : ""}</td>
                <td className="text-sm tnum">{m.lastFillOn ? fmtDate(m.lastFillOn) : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card mt-5">
        <h2>Care plan</h2>
        <p className="mt-2 text-sm text-ink-2">Contact every {h.carePlan.contactCadenceDays} days{h.carePlan.reviewedOn ? `; reviewed ${fmtDate(h.carePlan.reviewedOn)}` : ""}.{h.carePlan.respiteArrangement ? ` Respite: ${h.carePlan.respiteArrangement}` : ""}</p>
        {h.carePlan.goals.length > 0 && (
          <ul className="mt-3 list-disc pl-5 text-sm">
            {h.carePlan.goals.filter((g) => g.status === "active").map((g) => (
              <li key={g.id}>
                {g.text} <span className="text-ink-3">({g.owner})</span>
              </li>
            ))}
          </ul>
        )}
        <h3 className="mt-4">Watch for</h3>
        <ul className="mt-1 list-disc pl-5 text-sm">
          {h.carePlan.watchFor.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
        <h3 className="mt-4">Who to call</h3>
        <ul className="mt-1 text-sm">
          {h.carePlan.whoToCall.map((w) => (
            <li key={w.label}>
              {w.label}: <a className="underline tnum" href={`tel:${w.phone}`}>{w.phone}</a>
            </li>
          ))}
        </ul>
      </section>

      {h.edVisits.length > 0 && (
        <section className="card mt-5">
          <h2>Recent emergency visits</h2>
          <ul className="mt-2 text-sm">
            {h.edVisits.slice(0, 5).map((e) => (
              <li key={e.date}>
                {fmtDate(e.date)}: {e.reason}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-6 flex flex-wrap gap-3 items-center">
        <a href={`/share/${secret}/fhir?pin=${encodeURIComponent(pin)}`} className="btn btn-secondary">
          Download as FHIR R4 (JSON)
        </a>
        <span className="text-xs text-ink-3">Patient, RelatedPerson, Consent, Condition, MedicationStatement, CarePlan, Observation, Encounter, DocumentReference. Import into any FHIR-capable system.</span>
      </div>
      <p className="mt-6 text-xs text-ink-3">This record was shared by a family caregiver whose identity was verified at NIST IAL2 and whose authorization is on file. Each opening is logged. It is not a legal medical record; confirm with the primary care clinic above.</p>
    </div>,
  );
}
