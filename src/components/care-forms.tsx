import { startVerification } from "@/app/actions";
import { Notice } from "@/components/ui";
import type { ConsentBasis, ConsentRecord } from "@/lib/domain/types";
import { CONSENT_VALID_DAYS } from "@/lib/domain/types";
import { CONSENT_TEXT } from "@/lib/engine";
import { describeIdentityProviders } from "@/lib/integrations/identity";

/** Identity proofing chooser. Works for a household caregiver or an account-only session; the action decides which. */
export function VerifyBlock({ status, reason, sitePhone }: { status: string; reason?: string; sitePhone?: string }) {
  const providers = describeIdentityProviders();
  return (
    <div className="mt-4">
      <p className="text-ink-2">
        Before you can see anything from a care record, we need to know you are who you say you are. This is the same standard Medicare.gov uses for sign-in. It takes about five minutes with your phone and a driver&rsquo;s license or state ID.
      </p>
      {(status === "failed" || status === "in_person_pending") && (
        <Notice kind="amber">
          <strong>Last attempt did not go through.</strong> {reason}{" "}
          {sitePhone ? (
            <>
              You can try again, or call the clinic at <a className="underline" href={`tel:${sitePhone}`}>{sitePhone}</a> and the enrollment coordinator will verify you in person at your next visit.
            </>
          ) : (
            "You can try again, or call the clinic for your county and ask for in-person verification."
          )}
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

/** The legal basis, asked as a question about the person rather than as a category. `them` is the caregiver's own word ("your mom"). */
function basisChoices(them: string): Record<ConsentBasis, { label: string; hint: string }> {
  const cap = them.charAt(0).toUpperCase() + them.slice(1);
  return {
    patient: { label: `${cap} knows I am setting this up and can agree to it`, hint: "The clinic will confirm this with them at your first contact." },
    poa_healthcare: { label: `${cap} cannot decide things like this any more, and I have the paperwork (a health care power of attorney)`, hint: "Bring or send a copy to the clinic. Southside Legal Aid can help if you do not have one." },
    legal_guardian: { label: "A court appointed me as guardian", hint: "The clinic will record the court order." },
  };
}

/**
 * The authorization form. Rendered inside a parent <form>; the parent supplies the action and the submit button.
 * Fields: basis, typedSignature, shareDirectory, shareEvaluator, attest.
 */
export function ConsentFields({ patientName, signerName, previous, them }: { patientName: string; signerName: string; previous?: ConsentRecord; them?: string }) {
  const basisLabel = basisChoices(them ?? "the person I care for");
  return (
    <div className="card-soft mt-6 space-y-5">
      <div>
        <h2>{CONSENT_TEXT.title}</h2>
        <p className="mt-2 text-ink-2">{CONSENT_TEXT.intro.replace("the person named below", patientName)}</p>
      </div>
      {CONSENT_TEXT.sections.map((s) => (
        <div key={s.heading}>
          <h3>{s.heading}</h3>
          <p className="mt-1 text-ink-2 text-sm">{s.body}</p>
        </div>
      ))}
      <fieldset>
        <legend className="font-semibold">Which of these is true?</legend>
        <div className="mt-2 space-y-2">
          {(Object.keys(basisLabel) as ConsentBasis[]).map((b) => (
            <label key={b} className="flex gap-3 items-start">
              <input type="radio" name="basis" value={b} defaultChecked={(previous?.basis ?? "patient") === b} className="mt-1.5" required />
              <span>
                <span className="block">{basisLabel[b].label}</span>
                <span className="block text-xs text-ink-3">{basisLabel[b].hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="font-semibold">Optional sharing</legend>
        <label className="flex gap-3 items-start mt-2">
          <input type="checkbox" name="shareDirectory" defaultChecked={previous?.shareWith.directoryPartner ?? true} className="mt-1.5" />
          <span className="text-sm">Let the community resource directory know, without my name, when a referral from this app worked out, so listings stay accurate for the next family.</span>
        </label>
        <label className="flex gap-3 items-start mt-2">
          <input type="checkbox" name="shareEvaluator" defaultChecked={previous?.shareWith.evaluator ?? true} className="mt-1.5" />
          <span className="text-sm">Include de-identified measures (strain scores, visits, hospital use) in the pilot&rsquo;s independent evaluation.</span>
        </label>
      </fieldset>
      <label className="field">
        <span>If {them ?? "the person you care for"} can agree and wants to, they can sign here too (optional)</span>
        <input name="patientSignature" placeholder={patientName === "the person named above" ? "Their full name" : patientName} autoComplete="off" />
        <span className="text-xs font-normal text-ink-3">Only when you chose the first basis above. Their own name in their own hand (or typed with them watching) tells the clinic they took part in this decision.</span>
      </label>
      <label className="field">
        <span>Type your full name to sign</span>
        <input name="typedSignature" placeholder={signerName} required minLength={3} autoComplete="off" />
        <span className="text-xs font-normal text-ink-3">Typing your name here is your signature. We record the date, time, and a partial network address with it.</span>
      </label>
      <label className="flex gap-3 items-start">
        <input type="checkbox" name="attest" required className="mt-1.5" />
        <span className="text-sm">{CONSENT_TEXT.attestation}</span>
      </label>
      <p className="text-xs text-ink-3">This authorization lasts {CONSENT_VALID_DAYS} days. We will remind you two weeks before it lapses.</p>
    </div>
  );
}
