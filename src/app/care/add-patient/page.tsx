import Link from "next/link";
import { redirect } from "next/navigation";
import { cancelDraft, confirmAddPatient, discardDraftImport, draftAccess, draftConsent, draftDetails, draftWho, startDraftMedicare } from "@/app/actions";
import { ConsentFields } from "@/components/care-forms";
import { Field, Notice, Pill } from "@/components/ui";
import { CARE_TERMS, careTerm, voice } from "@/lib/domain/care-terms";
import { fmtDate } from "@/lib/engine";
import { coverageSummary, describeBlueButton, fillsFromImport } from "@/lib/integrations/bluebutton";
import { requireAccount } from "@/lib/services/care-context";
import { patientFactsFromImport } from "@/lib/services/self-register";
import { getRepository } from "@/lib/store";

export const dynamic = "force-dynamic";

type Step = "who" | "access" | "card" | "consent" | "medicare" | "details" | "confirm";
const ORDER: Step[] = ["who", "access", "consent", "medicare", "confirm"];

/**
 * Adding the person you care for, Medicare first. One question per screen; the voice follows the
 * caregiver's own word for the person ("your mom"). Medicare supplies the name, date of birth and
 * coverage, so the caregiver types nothing she can avoid; the manual form is the exception path.
 */
export default async function AddPatient({ searchParams }: PageProps<"/care/add-patient">) {
  const sp = await searchParams;
  const { session, account } = await requireAccount();
  if (session.householdId) redirect("/care/home");
  if (!account.givenName || !account.localityFips) redirect("/care/register");
  if (account.identity.status !== "verified" || account.identity.assurance !== "IAL2") redirect("/care/start?error=verify_first");
  const d = account.pending;
  const explicit = typeof sp.step === "string" ? (sp.step as Step) : undefined;
  // Never show a step the draft has not reached.
  const reached: Step = !d?.term ? "who" : !d.route ? "access" : !d.consent ? (explicit === "card" ? "card" : "consent") : d.import || d.details ? "confirm" : d.route === "none" ? "details" : "medicare";
  const order = (s: Step) => (s === "card" ? 1.5 : s === "details" ? 3 : ORDER.indexOf(s));
  // No step in the URL means "continue where I left off"; an earlier step may always be revisited.
  const requested = explicit ?? reached;
  const step: Step = order(requested) <= order(reached) ? requested : reached;
  // Back from Medicare.gov with a record in hand: go straight to the confirmation.
  if (step === "medicare" && d?.import) redirect("/care/add-patient?step=confirm");
  const v = voice(d?.term, d?.patientFirstName);
  const t = careTerm(d?.term);

  const Progress = ({ current }: { current: number }) => (
    <ol className="flex flex-wrap gap-2 text-xs">
      {["Who", "Medicare access", "Your authorization", "Their record", "Confirm"].map((label, i) => (
        <li key={label}>
          <Pill kind={i < current ? "green" : i === current ? "accent" : "neutral"}>
            {i + 1}. {label}
          </Pill>
        </li>
      ))}
    </ol>
  );
  const cancel = (
    <form action={cancelDraft} className="mt-8">
      <button className="btn btn-quiet text-sm">Stop for now (your answers are kept)</button>
    </form>
  );

  // ---- 1. Who ----
  if (step === "who") {
    const localities = (await getRepository().localities()).filter((l) => l.pilotPhase > 0).sort((a, b) => a.pilotPhase - b.pilotPhase || a.name.localeCompare(b.name));
    return (
      <div className="max-w-xl">
        <Progress current={0} />
        <h1 className="mt-4">Who are you caring for?</h1>
        <p className="mt-2 text-ink-2">Just so we can talk about them the way you do.</p>
        {sp.error === "term" && <Notice kind="amber">Pick one of the choices.</Notice>}
        <form action={draftWho} className="card mt-6 space-y-5">
          <fieldset>
            <legend className="sr-only">Who are you caring for?</legend>
            <div className="grid sm:grid-cols-2 gap-2">
              {CARE_TERMS.map((c) => (
                <label key={c.term} className="flex items-center gap-3 rounded-xl border border-rule px-4 py-3 has-[:checked]:border-accent has-[:checked]:bg-accent-2">
                  <input type="radio" name="term" value={c.term} defaultChecked={d?.term === c.term} required />
                  <span className="text-lg">{c.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <Field label="Their first name (optional)" hint="Medicare will give us the full name. This is only so we can say it the way you do.">
            <input name="patientFirstName" defaultValue={d?.patientFirstName} autoComplete="off" />
          </Field>
          <fieldset>
            <legend className="font-semibold">Do you live in the same home?</legend>
            <div className="mt-2 flex gap-6">
              <label className="flex items-center gap-2">
                <input type="radio" name="livesWith" value="yes" defaultChecked={d?.livesWith !== false} /> Yes
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="livesWith" value="no" defaultChecked={d?.livesWith === false} /> No
              </label>
            </div>
          </fieldset>
          <Field label="If not, where do they live?" hint="Only matters if you answered no.">
            <select name="localityFips" defaultValue={d?.localityFips ?? account.localityFips}>
              {localities.map((l) => (
                <option key={l.fips} value={l.fips}>
                  {l.name}
                </option>
              ))}
            </select>
          </Field>
          <button className="btn btn-primary btn-lg w-full">Next</button>
        </form>
      </div>
    );
  }

  // ---- 2. Medicare access ----
  if (step === "access") {
    return (
      <div className="max-w-xl">
        <Progress current={1} />
        <h1 className="mt-4">Can you get into {v.their} Medicare account?</h1>
        <p className="mt-2 text-ink-2">We ask Medicare for {v.their} coverage, prescriptions and recent visits so you do not have to type any of it, and so the clinic starts with facts. Most families do this with the person beside them. It is expected, and the clinic will confirm you as their representative.</p>
        {sp.error === "route" && <Notice kind="amber">Pick one of the choices.</Notice>}
        <form action={draftAccess} className="mt-6 grid gap-3">
          {[
            { route: "login", title: "Yes, I know the Medicare.gov login", body: "Fastest. About two minutes." },
            { route: "card", title: `${v.Them} has the Medicare card, but no online account`, body: "We will help you make one. You need the card, their date of birth and ZIP code. About five minutes." },
            { route: "none", title: `${v.Them} does not have Medicare`, body: "Under 65, or covered another way. You will type a few details instead." },
          ].map((o) => (
            <button key={o.route} name="route" value={o.route} className="card text-left hover:bg-paper-2">
              <span className="block text-lg font-bold">{o.title}</span>
              <span className="block text-ink-2 mt-1">{o.body}</span>
            </button>
          ))}
        </form>
        <Link href="/care/add-patient?step=who" className="inline-block mt-6 text-sm underline">
          Back
        </Link>
      </div>
    );
  }

  // ---- 2b. Card in hand ----
  if (step === "card") {
    return (
      <div className="max-w-xl">
        <Progress current={1} />
        <h1 className="mt-4">Make {v.their} Medicare.gov account</h1>
        <p className="mt-2 text-ink-2">Have the red, white and blue Medicare card in front of you. This is done on Medicare.gov, not here, and takes about five minutes.</p>
        <ol className="card mt-6 space-y-3 list-decimal pl-5">
          <li>
            Open <a className="underline" href="https://www.medicare.gov/account/create-account" target="_blank" rel="noreferrer">medicare.gov/account/create-account</a> in a new tab.
          </li>
          <li>Enter the Medicare Number from the card (eleven characters), {v.their} date of birth, and ZIP code.</li>
          <li>Choose a username and password. Write them where you will find them again; you will use them in the next step.</li>
          <li>Come back here.</li>
        </ol>
        <p className="mt-4 text-sm text-ink-3">If the account cannot be made right now (for example the card is at {v.their} house), stop here and come back later. Your answers are kept.</p>
        <Link href="/care/add-patient?step=consent" className="btn btn-primary btn-lg w-full mt-6 text-center">
          I have the login, continue
        </Link>
        <Link href="/care/add-patient?step=access" className="inline-block mt-6 text-sm underline">
          Back
        </Link>
        {cancel}
      </div>
    );
  }

  // ---- 3. Authorization ----
  if (step === "consent") {
    return (
      <div className="max-w-2xl">
        <Progress current={2} />
        <h1 className="mt-4">Your authorization</h1>
        <p className="mt-2 text-ink-2">Before we ask Medicare for anything, you sign one page saying who you are to {v.them} and that you may see and help manage their care information. It lasts 90 days; we remind you before it lapses.</p>
        {sp.error === "signature" && <Notice kind="amber">Please type your name to sign and tick the confirmation box.</Notice>}
        <form action={draftConsent}>
          <ConsentFields patientName={d?.patientFirstName || v.them} signerName={`${account.givenName} ${account.familyName}`} them={v.them} />
          <button className="btn btn-primary btn-lg w-full mt-6">Sign and continue</button>
        </form>
        {cancel}
      </div>
    );
  }

  // ---- 4a. Medicare hand-off ----
  if (step === "medicare") {
    const bb = describeBlueButton();
    const failed = sp.medicare === "failed" || sp.medicare === "error";
    return (
      <div className="max-w-xl">
        <Progress current={3} />
        <h1 className="mt-4">Now, Medicare</h1>
        {sp.medicare === "wrong_person" && <Notice kind="amber">That record was not {v.them}. Sign in to Medicare.gov again with {v.their} login.</Notice>}
        {failed && <Notice kind="amber">{sp.medicare === "error" ? "The Medicare connection could not start" : "Medicare.gov did not complete the authorization"}{sp.reason ? `: ${String(sp.reason)}` : ""}. You can try again, or add {v.them} by typing their details instead.</Notice>}
        {bb.configError && <Notice kind="amber">Medicare connection is not available right now. Configuration incomplete: {bb.configError}</Notice>}
        <p className="mt-2 text-ink-2">
          You will be sent to Medicare.gov. Sign in there as {v.them}{d?.route === "card" ? " with the account you just made" : ""}, press Allow, and you come straight back here. We never see the Medicare.gov password, and the access is discarded after the pull.
        </p>
        <div className="card mt-6">
          <div className="font-semibold">What we ask for</div>
          <ul className="mt-2 text-ink-2 text-sm list-disc pl-5 space-y-1">
            <li>Who {v.them} is: name and date of birth, so you do not type them</li>
            <li>What Medicare covers: Parts A, B, D, and whether Medicaid helps too</li>
            <li>Every prescription filled under Part D, so the medicine list starts full</li>
            <li>Recent doctor, hospital and emergency visits</li>
          </ul>
          {!bb.configError && (
            <form action={startDraftMedicare} className="mt-5">
              <button className="btn btn-primary btn-lg w-full">Go to Medicare.gov</button>
              <p className="text-xs text-ink-3 mt-2">{bb.mode === "mock" ? "Demo mode: a stand-in page plays Medicare.gov and returns synthetic records in the real Blue Button format." : "Live Blue Button 2.0 sandbox; use a sandbox beneficiary login from CMS."}</p>
            </form>
          )}
        </div>
        <p className="mt-4 text-sm">
          <Link href="/care/add-patient?step=details" className="underline">
            Type {v.their} details instead
          </Link>
        </p>
        {cancel}
      </div>
    );
  }

  // ---- 4b. Typed details ----
  if (step === "details") {
    return (
      <div className="max-w-xl">
        <Progress current={3} />
        <h1 className="mt-4">About {v.them}</h1>
        <p className="mt-2 text-ink-2">As it appears on their ID or insurance card.</p>
        {sp.error === "missing" && <Notice kind="amber">Please fill in their name and date of birth.</Notice>}
        <form action={draftDetails} className="card mt-6 space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="First name">
              <input name="givenName" required defaultValue={d?.details?.givenName ?? d?.patientFirstName} />
            </Field>
            <Field label="Last name">
              <input name="familyName" required defaultValue={d?.details?.familyName} />
            </Field>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Date of birth">
              <input name="birthDate" type="date" required defaultValue={d?.details?.birthDate} />
            </Field>
            <Field label="Sex on their insurance card">
              <select name="sex" defaultValue={d?.details?.sex ?? t.sex ?? "F"}>
                <option value="F">Female</option>
                <option value="M">Male</option>
              </select>
            </Field>
          </div>
          <Field label="Health coverage">
            <select name="coverage" defaultValue={d?.details?.coverage ?? (d?.route === "none" ? "none" : "medicare")}>
              <option value="medicare">Medicare (could not connect it now)</option>
              <option value="medicare_advantage">Medicare Advantage plan</option>
              <option value="other">Other insurance</option>
              <option value="none">No coverage right now</option>
            </select>
          </Field>
          <button className="btn btn-primary btn-lg w-full">Next</button>
        </form>
        {cancel}
      </div>
    );
  }

  // ---- 5. Confirm ----
  const imp = d?.import;
  const fromImport = imp ? patientFactsFromImport(imp, t.sex) : undefined;
  // Medicare lets a beneficiary decline to share demographics: claims arrive, the name does not. Ask for it once.
  const namesMissing = !!imp && (!fromImport?.givenName || !fromImport?.familyName || !fromImport?.birthDate) && !d?.details;
  if (namesMissing) {
    return (
      <div className="max-w-xl">
        <Progress current={4} />
        <h1 className="mt-4">Medicare shared the records, but not the name</h1>
        <p className="mt-2 text-ink-2">{v.Them} chose not to share personal details on Medicare.gov. That is fine; the coverage and prescriptions came through ({imp!.counts.pde} fills). Type {v.their} name and date of birth as they appear on the Medicare card.</p>
        <form action={draftDetails} className="card mt-6 space-y-4">
          <input type="hidden" name="coverage" value="medicare" />
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="First name">
              <input name="givenName" required defaultValue={fromImport?.givenName || d?.patientFirstName} />
            </Field>
            <Field label="Last name">
              <input name="familyName" required defaultValue={fromImport?.familyName} />
            </Field>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Date of birth">
              <input name="birthDate" type="date" required defaultValue={fromImport?.birthDate} />
            </Field>
            <Field label="Sex on the Medicare card">
              <select name="sex" defaultValue={fromImport?.sex ?? t.sex ?? "F"}>
                <option value="F">Female</option>
                <option value="M">Male</option>
              </select>
            </Field>
          </div>
          <button className="btn btn-primary btn-lg w-full">Next</button>
        </form>
        {cancel}
      </div>
    );
  }
  const facts = fromImport ? { ...fromImport, ...(d?.details ? { givenName: d.details.givenName, familyName: d.details.familyName, birthDate: d.details.birthDate, sex: d.details.sex } : {}) } : d?.details ? { ...d.details, coverage: undefined } : undefined;
  if (!facts) redirect("/care/add-patient?step=medicare");
  const fills = imp ? fillsFromImport(imp) : [];
  const cs = imp ? coverageSummary(imp) : undefined;
  const cov = cs && imp!.coverages.length ? { partA: cs.partA, partB: cs.partB, partC: cs.partC, partD: cs.partD, medicaid: cs.dual } : undefined;
  const covText = cov ? [cov.partA && "Part A", cov.partB && "Part B", cov.partC && "Medicare Advantage (Part C)", cov.partD && "Part D", cov.medicaid && "Medicaid"].filter(Boolean).join(", ") : d?.details?.coverage === "medicare_advantage" ? "Medicare Advantage" : d?.details?.coverage === "other" ? "Other insurance" : d?.details?.coverage === "none" ? "No coverage right now" : "Medicare";
  return (
    <div className="max-w-xl">
      <Progress current={4} />
      <h1 className="mt-4">Is this {v.them}?</h1>
      <div className="card mt-6">
        <div className="text-2xl font-bold">
          {facts.givenName} {facts.familyName}
        </div>
        <div className="text-ink-2 mt-1">Born {facts.birthDate ? fmtDate(facts.birthDate) : "(date not released)"}</div>
        <div className="text-ink-2">{covText}</div>
        {imp && (
          <p className="mt-3 text-sm text-ink-2">
            Medicare returned {imp.counts.coverages} coverage records, {fills.length} prescription fills and {imp.counts.eobs - imp.counts.pde} medical claims.
          </p>
        )}
        {cov?.partC && <Notice kind="blue">Because {v.them} has a Medicare Advantage plan, we see prescriptions but not all visits. The clinic will get the rest from the plan.</Notice>}
      </div>
      <form action={confirmAddPatient} className="mt-6">
        <button className="btn btn-primary btn-lg w-full">Yes, that is {v.them}</button>
      </form>
      <form action={discardDraftImport} className="mt-3">
        <button className="btn btn-secondary w-full">No, that is not {v.them}</button>
      </form>
      <p className="mt-4 text-xs text-ink-3">Saying yes creates {v.their} record with {imp ? "what Medicare returned" : "what you typed"} and your signed authorization. The clinic for your county is told, and confirms you as representative at your first contact.</p>
      {cancel}
    </div>
  );
}
