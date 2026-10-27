import Link from "next/link";
import { redirect } from "next/navigation";
import { registerCaregiver } from "@/app/actions";
import { Field, Notice } from "@/components/ui";
import { getCaregiverSession } from "@/lib/session";
import { getRepository } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function Register({ searchParams }: PageProps<"/care/register">) {
  const sp = await searchParams;
  if (await getCaregiverSession()) redirect("/care/start");
  const localities = (await getRepository().localities()).filter((l) => l.pilotPhase > 0).sort((a, b) => a.pilotPhase - b.pilotPhase || a.name.localeCompare(b.name));
  return (
    <div className="max-w-xl">
      <h1>Create your account</h1>
      <p className="mt-3 text-ink-2">This is about you, the caregiver. You will add the person you care for in the next step, after we have verified who you are.</p>
      {sp.error === "missing" && <Notice kind="amber">Please fill in your name, date of birth, and county.</Notice>}
      <form action={registerCaregiver} className="card mt-6 space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="First name">
            <input name="givenName" required autoComplete="given-name" />
          </Field>
          <Field label="Last name">
            <input name="familyName" required autoComplete="family-name" />
          </Field>
        </div>
        <Field label="Date of birth" hint="Must match your ID; the verifier checks it.">
          <input name="birthDate" type="date" required />
        </Field>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Mobile phone">
            <input name="phone" type="tel" placeholder="434-555-0100" autoComplete="tel" />
          </Field>
          <Field label="Email (optional)">
            <input name="email" type="email" autoComplete="email" />
          </Field>
        </div>
        <Field label="County or city where you live" hint="Decides which clinic and which local programs you see.">
          <select name="localityFips" required defaultValue="">
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
        <button className="btn btn-primary btn-lg w-full">Create account and continue</button>
        <p className="text-xs text-ink-3">
          Demo: no password is set. In the pilot, your CLEAR or ID.me login is your sign-in. Already registered? <Link href="/care" className="underline">Go back</Link>.
        </p>
      </form>
    </div>
  );
}
