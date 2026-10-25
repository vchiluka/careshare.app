import Link from "next/link";
import { notFound } from "next/navigation";
import { Pill, Tabs, TierPill } from "@/components/ui";
import { ageOn, fmtDate } from "@/lib/engine";
import { requireClinic } from "@/lib/services/clinic-context";
import { loadHouseholdView } from "@/lib/services/household-view";
import { getRepository } from "@/lib/store";
import { CaregiverTab } from "./_tabs/caregiver";
import { ContactsTab } from "./_tabs/contacts";
import { LogTab } from "./_tabs/log";
import { MedicationsTab } from "./_tabs/medications";
import { MessagesTab } from "./_tabs/messages";
import { OverviewTab } from "./_tabs/overview";
import { PlanTab } from "./_tabs/plan";
import { ReferralsTab } from "./_tabs/referrals";
import { SummaryTab } from "./_tabs/summary";
import { VisitsTab } from "./_tabs/visits";

export const dynamic = "force-dynamic";

const REFERRAL = { clinic: "clinic visit", directory: "community directory", aaa: "Area Agency on Aging", hospital_discharge: "hospital discharge", self: "family outreach" } as const;

export default async function HouseholdPage({ params, searchParams }: PageProps<"/clinic/households/[id]">) {
  const me = await requireClinic();
  const { id } = await params;
  const sp = await searchParams;
  const view = await loadHouseholdView(id);
  if (!view) notFound();
  const { h, asOf, site, locality, primary } = view;
  const tab = typeof sp.tab === "string" ? sp.tab : "overview";
  const audit = tab === "audit" ? await getRepository().auditLog({ householdId: id, limit: 100 }) : [];
  const unread = h.messages.filter((m) => m.from === "caregiver" && !m.readAt).length;
  const tabs = [
    { key: "overview", label: "Overview", count: view.signals.filter((s) => s.severity !== "info").length },
    { key: "caregiver", label: "Caregiver & access" },
    { key: "plan", label: "Care plan" },
    { key: "medications", label: "Medications", count: view.discrepancies.filter((d) => d.severity === "warning").length },
    { key: "log", label: "Symptom log" },
    { key: "visits", label: "Visits" },
    { key: "messages", label: "Messages", count: unread },
    { key: "contacts", label: "Contacts" },
    { key: "referrals", label: "Referrals" },
    { key: "summary", label: "Monthly summary & documentation" },
    { key: "audit", label: "Evidence" },
  ];
  return (
    <div>
      <div className="text-sm text-ink-3">
        <Link href="/clinic/households" className="underline">Households</Link> / {locality.name}
      </div>
      <div className="flex flex-wrap items-start justify-between gap-4 mt-1">
        <div>
          <h1>
            {h.patient.givenName} {h.patient.familyName}
          </h1>
          <div className="text-ink-2 mt-1">
            {ageOn(h.patient.birthDate, asOf)}, {h.patient.sex === "F" ? "female" : "male"} · {h.patient.diagnoses[0]?.display} · {h.patient.coverage.medicaid ? "Medicare and Medicaid" : "Medicare"}
            {h.patient.coverage.partC ? " (Medicare Advantage)" : ""} · {site.name}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <TierPill tier={h.carePlan.tier} />
            <Pill kind={h.status === "active" ? "green" : "neutral"}>{h.status}</Pill>
            {primary ? <Pill kind={primary.proxy.status === "confirmed" ? "green" : "amber"}>{primary.givenName}: {primary.identity.status === "verified" ? (primary.proxy.status === "confirmed" ? "verified, proxy confirmed" : `verified, proxy ${primary.proxy.status.replaceAll("_", " ")}`) : primary.identity.status.replaceAll("_", " ")}</Pill> : <Pill>No caregiver</Pill>}
            {h.medicare.connected && <Pill kind="blue">Medicare connected</Pill>}
            {h.patient.ehrPatientId && <Pill kind="slate">EHR linked</Pill>}
          </div>
        </div>
        <div className="text-right text-sm text-ink-3">
          <div>Enrolled {fmtDate(h.enrolledOn)} via {REFERRAL[h.referralSource]}</div>
          <div>Signed in as {me.name}</div>
        </div>
      </div>

      <Tabs base={`/clinic/households/${id}`} tabs={tabs} current={tab} />

      <div className="mt-6">
        {tab === "overview" && <OverviewTab view={view} />}
        {tab === "caregiver" && <CaregiverTab view={view} />}
        {tab === "plan" && <PlanTab view={view} />}
        {tab === "medications" && <MedicationsTab view={view} />}
        {tab === "log" && <LogTab view={view} />}
        {tab === "visits" && <VisitsTab view={view} />}
        {tab === "messages" && <MessagesTab view={view} />}
        {tab === "contacts" && <ContactsTab view={view} />}
        {tab === "referrals" && <ReferralsTab view={view} />}
        {tab === "summary" && <SummaryTab view={view} />}
        {tab === "audit" && (
          <table className="data">
            <thead>
              <tr>
                <th>When</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Reference</th>
              </tr>
            </thead>
            <tbody>
              {audit.map((a) => (
                <tr key={a.id}>
                  <td className="tnum text-ink-3">{a.at.replace("T", " ").slice(0, 19)}</td>
                  <td>{a.actor}</td>
                  <td>
                    {a.action}
                    {a.detail && <div className="text-xs text-ink-3">{a.detail}</div>}
                  </td>
                  <td className="text-ink-3">{a.reference}</td>
                </tr>
              ))}
              {audit.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-ink-3">No events this session. Seeded history is not audited; every action from here on is.</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
