import Link from "next/link";
import { redirect } from "next/navigation";
import { joinWithInvite, signOutCaregiver } from "@/app/actions";
import { VerifyBlock } from "@/components/care-forms";
import { Notice, Pill } from "@/components/ui";
import { voice } from "@/lib/domain/care-terms";
import { requireAccount } from "@/lib/services/care-context";
import { getRepository } from "@/lib/store";

export const dynamic = "force-dynamic";

/** First run for a self-registered caregiver: verify, add the patient, connect Medicare, look around. */
export default async function Start({ searchParams }: PageProps<"/care/start">) {
  const sp = await searchParams;
  const { session, account } = await requireAccount();
  if (session.householdId) redirect("/care/home");
  if (!account.givenName || !account.localityFips) redirect("/care/register");
  const repo = getRepository();
  const [localities, sites, education] = await Promise.all([repo.localities(), repo.sites(), repo.education()]);
  const locality = localities.find((l) => l.fips === account.localityFips);
  const site = sites.find((s) => s.localityFips === account.localityFips) ?? sites[0];
  const verified = account.identity.status === "verified" && account.identity.assurance === "IAL2";
  const msg = sp.error === "invite_locked" ? "Too many wrong codes. Ask your family member to make a new invitation and call the clinic if you need help." : sp.error === "invite" ? "That invitation code did not match, has been used, or has expired. Ask your family member to make a new one." : sp.verify === "ok" ? "You are verified. Thank you." : sp.verify === "failed" ? `Verification did not go through: ${String(sp.reason ?? "")}` : sp.verify === "error" ? (sp.reason ? `Verification could not start: ${String(sp.reason)}` : "The verification link expired. Please start again.") : sp.error === "verify_first" ? "Please verify your identity before adding a patient." : null;

  return (
    <div className="max-w-2xl">
      {msg && <Notice kind={sp.verify === "ok" ? "green" : "amber"}>{msg}</Notice>}
      <h1 className="mt-4">Welcome, {account.givenName}.</h1>
      <p className="mt-2 text-ink-2">
        Your clinic partner for {locality?.name ?? "your county"} is {site.orgName}, {site.town}. Four steps and you are set up. You can stop and come back any time.
      </p>

      <ol className="mt-8 space-y-4">
        <Step n={1} title="Verify who you are" state={verified ? "done" : "now"}>
          {verified ? (
            <p className="text-sm text-ink-2">
              Verified on {account.identity.verifiedOn} through {account.identity.provider === "clear" ? "CLEAR" : "ID.me"}.
            </p>
          ) : (
            <VerifyBlock status={account.identity.status} reason={account.identity.failureReason} sitePhone={site.phone} />
          )}
        </Step>
        <Step n={2} title="Add the person you care for" state={verified ? "now" : "later"}>
          <p className="text-sm text-ink-2">Who they are to you, a one-page authorization you sign by typing your name, then Medicare fills in the rest: their name, date of birth, coverage and every prescription filled. You type almost nothing. About ten minutes with the Medicare.gov login at hand.</p>
          {verified && (
            <Link href="/care/add-patient" className="btn btn-primary btn-lg mt-3 w-full sm:w-auto text-center">
              {account.pending?.term ? `Continue adding ${voice(account.pending.term, account.pending.patientFirstName).them}` : "Add the person I care for"}
            </Link>
          )}
          {verified && (
            <details className="mt-4 text-sm" open={sp.error === "invite" || sp.error === "invite_locked"}>
              <summary className="cursor-pointer text-ink-2 underline">Is someone in your family already using CareShare for this person?</summary>
              <div className="mt-2 card-soft">
                <p className="text-ink-2">Then do not start a new record. Ask them to open <strong>Who helps</strong> in their CareShare and make you an invitation code (two groups of three digits, good for 14 days, usable once). Enter it here and you join the same record as a second verified caregiver, then sign your own authorization.</p>
                <form action={joinWithInvite} className="mt-3 flex flex-wrap items-end gap-2">
                  <label className="field">
                    <span>Invitation code</span>
                    <input name="code" placeholder="123-456" className="max-w-40" inputMode="numeric" autoComplete="one-time-code" />
                  </label>
                  <button className="btn btn-secondary inline">Join their record</button>
                </form>
              </div>
            </details>
          )}
        </Step>
        <Step n={3} title="See what Medicare knows" state="later">
          <p className="text-sm text-ink-2">The medicine list starts full, marked &ldquo;from Medicare, to be confirmed&rdquo;. The clinic for your county is told and confirms you as representative at your first contact.</p>
        </Step>
        <Step n={4} title="Look around" state="later">
          <p className="text-sm text-ink-2">
            Local help in {locality?.name ?? "your county"} (respite hours, adult day, rides, meals) and {education.length} short guides written for caregivers. Both are open now.
          </p>
          <div className="flex gap-3 mt-3">
            <Link href="/care/learn" className="btn btn-secondary">
              Guides
            </Link>
            <Link href="/care/resources" className="btn btn-secondary">
              Help nearby
            </Link>
          </div>
        </Step>
      </ol>

      <form action={signOutCaregiver} className="mt-10">
        <button className="btn btn-quiet">Sign out</button>
      </form>
    </div>
  );
}

function Step({ n, title, state, children }: { n: number; title: string; state: "done" | "now" | "later"; children: React.ReactNode }) {
  return (
    <li className={`card ${state === "later" ? "opacity-70" : ""}`}>
      <div className="flex items-center gap-3">
        <span className={`h-7 w-7 rounded-full flex items-center justify-center text-sm font-bold ${state === "done" ? "bg-green text-white" : state === "now" ? "bg-accent text-white" : "bg-paper-2 text-ink-3"}`}>{state === "done" ? "✓" : n}</span>
        <h2 className="flex-1">{title}</h2>
        {state === "done" && <Pill kind="green">Done</Pill>}
        {state === "now" && <Pill kind="accent">Next</Pill>}
      </div>
      <div className="mt-3">{children}</div>
    </li>
  );
}
