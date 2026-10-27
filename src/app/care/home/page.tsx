import Link from "next/link";
import { requestProxy, startVerification } from "@/app/actions";
import { Notice, Pill, SignalList } from "@/components/ui";
import { fmtDate, labelPurpose } from "@/lib/engine";
import { describeIdentityProviders } from "@/lib/integrations/identity";
import { requireCare } from "@/lib/services/care-context";

export const dynamic = "force-dynamic";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default async function CareHome({ searchParams }: PageProps<"/care/home">) {
  const sp = await searchParams;
  const { view, me, access } = await requireCare();
  const { h, asOf, signals, site } = view;
  const verifyMsg = sp.verify === "ok" ? "You are verified. Thank you." : sp.verify === "failed" ? `Verification did not go through: ${String(sp.reason ?? "")}` : sp.verify === "error" ? (sp.reason ? `Verification could not start: ${String(sp.reason)}` : "The verification link expired. Please start again.") : null;

  if (!access.record) {
    return (
      <div className="max-w-2xl">
        {verifyMsg && <Notice kind={sp.verify === "ok" ? "green" : "amber"}>{verifyMsg}</Notice>}
        <h1 className="mt-4">Hello, {me.givenName}.</h1>
        {me.identity.status !== "verified" ? <VerifyBlock status={me.identity.status} reason={me.identity.failureReason} sitePhone={site.phone} /> : <WaitingBlock status={me.proxy.status} patient={h.patient.givenName} sitePhone={site.phone} />}
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
      <h1 className="mt-2">
        {h.patient.givenName}&rsquo;s care, {fmtDate(asOf)}
      </h1>
      <p className="mt-2 text-ink-2">
        You are confirmed as {h.patient.givenName}&rsquo;s representative with {site.orgName}. Everything below is shared with the care team there.
      </p>

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

async function VerifyBlock({ status, reason, sitePhone }: { status: string; reason?: string; sitePhone: string }) {
  const providers = describeIdentityProviders();
  return (
    <div className="mt-4">
      <p className="text-ink-2">
        Before you can see anything from the record, we need to know you are who you say you are. This is the same standard Medicare.gov uses for sign-in. It takes about five minutes with your phone and a driver&rsquo;s license or state ID.
      </p>
      {(status === "failed" || status === "in_person_pending") && (
        <Notice kind="amber">
          <strong>Last attempt did not go through.</strong> {reason} You can try again, or call the clinic at <a className="underline" href={`tel:${sitePhone}`}>{sitePhone}</a> and the enrollment coordinator will verify you in person at your next visit. Either way you end up in the same place.
        </Notice>
      )}
      <div className="grid sm:grid-cols-2 gap-4 mt-6">
        {providers.map((p) =>
          p.configError ? (
            <div key={p.id} className="card opacity-80">
              <div className="font-bold text-xl">{p.displayName}</div>
              <p className="text-ink-2 mt-1">Not available right now.</p>
              <div className="text-xs text-amber mt-3">Configuration incomplete: {p.configError}</div>
            </div>
          ) : (
            <form key={p.id} action={startVerification} className="card">
              <input type="hidden" name="provider" value={p.id} />
              <div className="font-bold text-xl">{p.displayName}</div>
              <p className="text-ink-2 mt-1">{p.id === "clear" ? "Uses your face and your ID. If you already have a CLEAR account, it is the fastest." : "Uses your ID and a selfie, or a video call with an agent if the photos do not work."}</p>
              <button className="btn btn-primary mt-4 w-full">Verify with {p.displayName}</button>
              <div className="text-xs text-ink-3 mt-2">{p.mode === "mock" ? "Demo mode: a stand-in page plays the vendor." : "Live sandbox."}</div>
            </form>
          ),
        )}
      </div>
      <p className="text-sm text-ink-3 mt-4">We keep only a reference from the verifier and the date. We never see or store pictures of your ID.</p>
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
