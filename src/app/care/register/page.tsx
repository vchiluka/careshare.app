import Link from "next/link";
import { redirect } from "next/navigation";
import { completeRegistration, startRegistration } from "@/app/actions";
import { Field, Notice, Pill } from "@/components/ui";
import type { CaregiverAccount } from "@/lib/domain/types";
import { describeIdentityProviders } from "@/lib/integrations/identity";
import { getCaregiverSession } from "@/lib/session";
import { getRepository } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * Registration, identity first.
 *   Step 1: choose CLEAR or ID.me and verify. A provisional account holds the result.
 *   Step 2: contact details and county (name and date of birth prefilled from the vendor when released).
 * Then /care/start: add the person you care for, sign the authorization, connect Medicare.
 */
export default async function Register({ searchParams }: PageProps<"/care/register">) {
  const sp = await searchParams;
  const repo = getRepository();
  const s = await getCaregiverSession();
  const account: CaregiverAccount | undefined = s?.accountId ? await repo.account(s.accountId) : undefined;
  const verified = !!account && account.identity.status === "verified" && account.identity.assurance === "IAL2";
  const complete = !!account && !!account.givenName && !!account.localityFips;
  if (verified && complete) redirect(account.householdIds.length ? "/care/home" : "/care/start");

  const msg =
    sp.verify === "ok"
      ? "You are verified. A few details and you are in."
      : sp.verify === "failed"
        ? `Verification did not go through: ${String(sp.reason ?? "")}`
        : sp.verify === "error"
          ? sp.reason
            ? `Verification could not start: ${String(sp.reason)}`
            : "The verification link expired. Please start again."
          : sp.error === "missing"
            ? "Please fill in your name, date of birth, and county."
            : null;

  if (verified && account) {
    const localities = (await repo.localities()).filter((l) => l.pilotPhase > 0).sort((a, b) => a.pilotPhase - b.pilotPhase || a.name.localeCompare(b.name));
    const fromVendor = !!account.givenName;
    return (
      <div className="max-w-xl">
        <StepHeader step={2} />
        {msg && <Notice kind={sp.verify === "ok" ? "green" : "amber"}>{msg}</Notice>}
        <h1 className="mt-4">About you</h1>
        <p className="mt-2 text-ink-2">
          {fromVendor ? `${account.identity.provider === "clear" ? "CLEAR" : "ID.me"} confirmed your name and date of birth; check them and add how to reach you.` : "Your name and date of birth as they appear on the ID you just used."}
        </p>
        <form action={completeRegistration} className="card mt-6 space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="First name">
              <input name="givenName" required defaultValue={account.givenName} autoComplete="given-name" />
            </Field>
            <Field label="Last name">
              <input name="familyName" required defaultValue={account.familyName} autoComplete="family-name" />
            </Field>
          </div>
          <Field label="Date of birth">
            <input name="birthDate" type="date" required defaultValue={account.birthDate} />
          </Field>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Mobile phone">
              <input name="phone" type="tel" placeholder="434-555-0100" autoComplete="tel" defaultValue={account.phone} />
            </Field>
            <Field label="Email (optional)">
              <input name="email" type="email" autoComplete="email" defaultValue={account.email} />
            </Field>
          </div>
          <Field label="County or city where you live" hint="Decides which clinic and which local programs you see.">
            <select name="localityFips" required defaultValue={account.localityFips || ""}>
              <option value="" disabled>
                Choose
              </option>
              {localities.map((l) => (
                <option key={l.fips} value={l.fips}>
                  {l.name}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid sm:grid-cols-2 gap-4">
            <label className="flex gap-3 items-center">
              <input type="checkbox" name="smartphone" defaultChecked />
              <span>I have a smartphone</span>
            </label>
            <Field label="Internet at home">
              <select name="broadband" defaultValue="low">
                <option value="ok">Reliable</option>
                <option value="low">Slow or spotty</option>
                <option value="none">None, phone data only</option>
              </select>
            </Field>
          </div>
          <button className="btn btn-primary btn-lg w-full">Continue</button>
        </form>
      </div>
    );
  }

  // Step 1: verify. Shown with no session, with a session that no longer resolves, with a clinic-enrolled
  // caregiver's session (registering is a different person; the new sign-in replaces it), or after a failed attempt.
  const providers = describeIdentityProviders();
  const status = account?.identity.status ?? "not_started";
  return (
    <div className="max-w-xl">
      <StepHeader step={1} />
      {msg && <Notice kind="amber">{msg}</Notice>}
      <h1 className="mt-4">First, prove it is you</h1>
      <p className="mt-2 text-ink-2">
        You will see someone else&rsquo;s health information, so we start by checking who you are. It is the same standard Medicare.gov uses for sign-in: about five minutes with your phone and a driver&rsquo;s license or state ID. Your name comes from the ID, so there is nothing to type first.
      </p>
      {(status === "failed" || status === "in_person_pending") && (
        <Notice kind="amber">
          <strong>Last attempt did not go through.</strong> {account?.identity.failureReason} You can try again with either service, or call the clinic for your county and ask for in-person verification.
        </Notice>
      )}
      {status === "pending" && <Notice kind="blue">A verification is in progress. If you closed the vendor page, start again below.</Notice>}
      <div className="grid sm:grid-cols-2 gap-4 mt-6">
        {providers.map((p) =>
          p.configError ? (
            <div key={p.id} className="card opacity-80">
              <div className="font-bold text-xl">{p.displayName}</div>
              <p className="text-ink-2 mt-1">Not available right now.</p>
              <div className="text-xs text-amber mt-3">Configuration incomplete: {p.configError}</div>
            </div>
          ) : (
            <form key={p.id} action={startRegistration} className="card">
              <input type="hidden" name="provider" value={p.id} />
              <div className="font-bold text-xl">{p.displayName}</div>
              <p className="text-ink-2 mt-1">{p.id === "clear" ? "Uses your face and your ID. If you already have a CLEAR account, it is the fastest." : "Uses your ID and a selfie, or a video call with an agent if the photos do not work."}</p>
              <button className="btn btn-primary mt-4 w-full">Continue with {p.displayName}</button>
              <div className="text-xs text-ink-3 mt-2">{p.mode === "mock" ? "Demo mode: a stand-in page plays the vendor." : "Live sandbox."}</div>
            </form>
          ),
        )}
      </div>
      <p className="text-sm text-ink-3 mt-4">We keep only a reference from the verifier, your name and date of birth as verified, and the date. We never see or store pictures of your ID.</p>
      <p className="text-sm text-ink-3 mt-2">
        Already registered? <Link href="/care" className="underline">Sign in</Link>.
      </p>
    </div>
  );
}

function StepHeader({ step }: { step: 1 | 2 }) {
  const steps = ["Verify who you are", "About you", "Add the person you care for", "Connect Medicare"];
  return (
    <ol className="flex flex-wrap gap-2 text-xs">
      {steps.map((label, i) => (
        <li key={label}>
          <Pill kind={i + 1 < step ? "green" : i + 1 === step ? "accent" : "neutral"}>
            {i + 1}. {label}
          </Pill>
        </li>
      ))}
    </ol>
  );
}
