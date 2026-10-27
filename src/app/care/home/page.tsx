import Link from "next/link";
import { connectMedicare, requestProxy } from "@/app/actions";
import { VerifyBlock } from "@/components/care-forms";
import { Notice, Pill, SignalList } from "@/components/ui";
import { fmtDate, labelPurpose } from "@/lib/engine";
import { requireCare } from "@/lib/services/care-context";

export const dynamic = "force-dynamic";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default async function CareHome({ searchParams }: PageProps<"/care/home">) {
  const sp = await searchParams;
  const { view, me, access } = await requireCare();
  const { h, asOf, signals, site } = view;
  const verifyMsg = sp.verify === "ok" ? "You are verified. Thank you." : sp.verify === "failed" ? `Verification did not go through: ${String(sp.reason ?? "")}` : sp.verify === "error" ? (sp.reason ? `Verification could not start: ${String(sp.reason)}` : "The verification link expired. Please start again.") : sp.consent === "ok" ? "Your authorization is signed. Thank you." : sp.welcome ? `${h.patient.givenName}'s record is open. Connecting Medicare is the fastest way to fill it in.` : null;

  if (!access.record) {
    return (
      <div className="max-w-2xl">
        {verifyMsg && <Notice kind={sp.verify === "ok" || sp.consent === "ok" ? "green" : "amber"}>{verifyMsg}</Notice>}
        <h1 className="mt-4">Hello, {me.givenName}.</h1>
        {me.identity.status !== "verified" ? <VerifyBlock status={me.identity.status} reason={me.identity.failureReason} sitePhone={site.phone} /> : access.needsConsent ? <ConsentBlock reason={access.reason} patient={h.patient.givenName} /> : <WaitingBlock status={me.proxy.status} patient={h.patient.givenName} sitePhone={site.phone} />}
        {access.ownHealth && (
          <div className="card mt-6">
            <h2>While you wait: your own check-in</h2>
            <p className="mt-2 text-ink-2">Your health is part of this too. You can record how you are doing now; it is yours and stays with the clinic team.</p>
            <Link href="/care/checkin" className="btn btn-secondary mt-4">Go to my check-in</Link>
          </div>
        )}
      </div>
    );
  }

  const nextVisit = h.appointments.filter((a) => a.status === "scheduled" && a.date >= asOf).sort((a, b) => a.date.localeCompare(b.date))[0];
  const unread = h.messages.filter((m) => m.from === "clinic" && !m.readAt).length;
  const mySignals = signals.filter((s) => s.owner !== "clinic");
  const lastZbi = me.health.zbi.at(-1);
  return (
    <div>
      {verifyMsg && <Notice kind="green">{verifyMsg}</Notice>}
      {access.consent.state === "expiring" && (
        <Notice kind="amber">
          Your authorization lapses in {access.consent.daysLeft} day{access.consent.daysLeft === 1 ? "" : "s"}. <Link href="/care/consent" className="underline font-semibold">Re-affirm it now</Link> so the record stays open.
        </Notice>
      )}
      <h1 className="mt-2">
        {h.patient.givenName}&rsquo;s care, {fmtDate(asOf)}
      </h1>
      <p className="mt-2 text-ink-2">
        {me.proxy.status === "confirmed" ? `You are confirmed as ${h.patient.givenName}’s representative with ${site.orgName}.` : `You added ${h.patient.givenName} and signed the authorization; ${site.orgName} will confirm you as representative at your first contact.`} Everything below is shared with the care team there.
      </p>
      {h.origin === "self_registered" && <GettingStarted h={h} />}

      <div className="grid md:grid-cols-2 gap-5 mt-8">
        <div className="card">
          <h2>Next visit</h2>
          {nextVisit ? (
            <div className="mt-3">
              <div className="text-xl font-bold">
                {fmtDate(nextVisit.date)}
                {nextVisit.time ? `, ${nextVisit.time}` : ""}
              </div>
              <div className="text-ink-2">{cap(labelPurpose(nextVisit.purpose))}</div>
              <div className="text-ink-2">
                {nextVisit.withName} · {nextVisit.location}
              </div>
              <div className="mt-2">{nextVisit.transport.needed ? nextVisit.transport.arranged ? <Pill kind="green">Ride arranged: {nextVisit.transport.provider}</Pill> : <Pill kind="amber">Ride still needed</Pill> : <Pill>Own transport</Pill>}</div>
              <Link href="/care/visits" className="btn btn-secondary mt-4">All visits and rides</Link>
            </div>
          ) : (
            <p className="mt-3 text-ink-2">No visit scheduled. The clinic will reach out when one is due.</p>
          )}
        </div>
        <div className="card">
          <h2>Things to act on</h2>
          <div className="mt-3">
            <SignalList signals={mySignals} owner="caregiver" />
          </div>
          {unread > 0 && (
            <Link href="/care/messages" className="btn btn-primary mt-4">
              {unread} new message{unread === 1 ? "" : "s"} from the clinic
            </Link>
          )}
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-5 mt-5">
        <Link href="/care/log" className="card hover:bg-paper-2">
          <h3>Log something</h3>
          <p className="text-ink-2 mt-1">A fall, a bad night, confusion that is new, a behavior that frightened you. Thirty seconds, and the clinic sees it.</p>
        </Link>
        <Link href="/care/checkin" className="card hover:bg-paper-2">
          <h3>My check-in</h3>
          <p className="text-ink-2 mt-1">{lastZbi ? `Your last strain check-in was ${fmtDate(lastZbi.date)}.` : "You have not done a strain check-in yet."} How you are doing matters to this plan.</p>
        </Link>
        <Link href="/care/resources" className="card hover:bg-paper-2">
          <h3>Help nearby</h3>
          <p className="text-ink-2 mt-1">Respite hours, adult day, rides and meals listed for {view.locality.name}.</p>
        </Link>
      </div>
      <div className="grid md:grid-cols-2 gap-5 mt-5">
        <Link href="/care/learn" className="card hover:bg-paper-2">
          <h3>Guides</h3>
          <p className="text-ink-2 mt-1">Short guides on sundowning, bathing, wandering, medicines, Medicare, and your own strain, ordered for {h.patient.givenName}&rsquo;s stage.</p>
        </Link>
        <Link href="/care/consent" className="card hover:bg-paper-2">
          <h3>Your authorization</h3>
          <p className="text-ink-2 mt-1">{access.consent.daysLeft !== undefined ? `Valid for ${access.consent.daysLeft} more days.` : ""} See what you agreed to, re-affirm, or revoke.</p>
        </Link>
      </div>

      <div className="card-soft mt-8">
        <h2>Watch for, and who to call</h2>
        <ul className="mt-3 space-y-1.5 list-disc pl-5 text-ink-2">
          {h.carePlan.watchFor.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
        <div className="mt-4 flex flex-wrap gap-x-8 gap-y-2">
          {h.carePlan.whoToCall.map((w) => (
            <div key={w.label}>
              <div className="text-sm text-ink-3">{w.label}</div>
              <a href={`tel:${w.phone}`} className="text-xl font-bold tnum">
                {w.phone}
              </a>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function WaitingBlock({ status, patient, sitePhone }: { status: string; patient: string; sitePhone: string }) {
  return (
    <div className="mt-4">
      <Notice kind="green">You are verified.</Notice>
      <div className="card mt-4">
        <h2>One more step, and it is on the clinic</h2>
        <p className="mt-2 text-ink-2">
          The clinic records {patient}&rsquo;s consent (or your power of attorney) once and confirms you as the representative. After that, every part of this record opens for you, and you will not fill out another proxy form provider by provider.
        </p>
        {status === "requested" ? (
          <p className="mt-3">
            <Pill kind="amber">Request sent, waiting for the clinic</Pill>
          </p>
        ) : (
          <form action={requestProxy} className="mt-4">
            <button className="btn btn-primary">Ask the clinic to confirm me</button>
          </form>
        )}
        <p className="text-sm text-ink-3 mt-4">
          Taking long? Call <a className="underline" href={`tel:${sitePhone}`}>{sitePhone}</a>.
        </p>
      </div>
    </div>
  );
}

function ConsentBlock({ reason, patient }: { reason: string; patient: string }) {
  return (
    <div className="mt-4">
      <Notice kind="amber">{reason}</Notice>
      <div className="card mt-4">
        <h2>Sign the authorization to open {patient}&rsquo;s record</h2>
        <p className="mt-2 text-ink-2">One page. You choose the basis (their consent, a power of attorney, or a guardianship) and type your name. It lasts 90 days.</p>
        <Link href="/care/consent" className="btn btn-primary mt-4">
          Go to the authorization
        </Link>
      </div>
    </div>
  );
}

/** Checklist shown on a self-registered household until Medicare is connected and the clinic has confirmed. */
function GettingStarted({ h }: { h: import("@/lib/domain/types").Household }) {
  const me = h.caregivers[0];
  const steps: { label: string; done: boolean; body: React.ReactNode }[] = [
    { label: "Verified and authorization signed", done: true, body: null },
    {
      label: "Connect Medicare records",
      done: h.medicare.connected,
      body: h.medicare.connected ? (
        <span className="text-sm text-ink-2">
          Connected {h.medicare.lastSyncOn ? fmtDate(h.medicare.lastSyncOn) : ""}: {h.medicareImport?.counts.eobs ?? h.medicareFills.length} claims, {h.medicareFills.length} prescription fills. <Link href="/care/medications" className="underline">See medicines</Link>.
        </span>
      ) : (
        <form action={connectMedicare} className="mt-2">
          <p className="text-sm text-ink-2 mb-2">You will go to Medicare.gov and sign in as {h.patient.givenName} or as their representative. We pull coverage, prescriptions filled, and recent visits.</p>
          <button className="btn btn-primary">Connect Medicare</button>
        </form>
      ),
    },
    { label: "Clinic confirms you as representative", done: me.proxy.status === "confirmed", body: me.proxy.status === "confirmed" ? null : <span className="text-sm text-ink-2">Happens at your first contact with the care team. Nothing for you to do; bring the power of attorney if you have one.</span> },
    { label: "First strain check-in", done: me.health.zbi.length > 0, body: me.health.zbi.length ? null : <Link href="/care/checkin" className="underline text-sm">Twelve questions, three minutes</Link> },
  ];
  if (steps.every((s) => s.done)) return null;
  return (
    <div className="card-soft mt-6">
      <h2>Getting started</h2>
      <ol className="mt-3 space-y-3">
        {steps.map((s) => (
          <li key={s.label} className="flex gap-3">
            <span className={`mt-0.5 h-5 w-5 shrink-0 rounded-full flex items-center justify-center text-xs font-bold ${s.done ? "bg-green text-white" : "bg-paper-2 text-ink-3"}`}>{s.done ? "✓" : ""}</span>
            <div className="min-w-0 flex-1">
              <div className={s.done ? "text-ink-3 line-through" : "font-semibold"}>{s.label}</div>
              {!s.done && s.body}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
