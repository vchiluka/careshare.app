import { redirect } from "next/navigation";
import { addPatient } from "@/app/actions";
import { ConsentFields } from "@/components/care-forms";
import { Field, Notice } from "@/components/ui";
import { requireAccount } from "@/lib/services/care-context";
import { getRepository } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function AddPatient({ searchParams }: PageProps<"/care/add-patient">) {
  const sp = await searchParams;
  const { session, account } = await requireAccount();
  if (session.householdId) redirect("/care/home");
  if (!account.givenName || !account.localityFips) redirect("/care/register");
  if (account.identity.status !== "verified" || account.identity.assurance !== "IAL2") redirect("/care/start?error=verify_first");
  const localities = (await getRepository().localities()).filter((l) => l.pilotPhase > 0).sort((a, b) => a.pilotPhase - b.pilotPhase || a.name.localeCompare(b.name));
  return (
    <div className="max-w-2xl">
      <h1>Add the person you care for</h1>
      <p className="mt-3 text-ink-2">Just enough for the clinic to find or open their chart. Medicare will fill in the rest in the next step.</p>
      {sp.error === "missing" && <Notice kind="amber">Please fill in their name and date of birth.</Notice>}
      {sp.error === "signature" && <Notice kind="amber">Please type your name to sign and tick the confirmation box.</Notice>}
      <form action={addPatient} className="mt-6">
        <div className="card space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Their first name">
              <input name="givenName" required />
            </Field>
            <Field label="Their last name">
              <input name="familyName" required />
            </Field>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Their date of birth">
              <input name="birthDate" type="date" required />
            </Field>
            <Field label="Sex on their Medicare card">
              <select name="sex" defaultValue="F">
                <option value="F">Female</option>
                <option value="M">Male</option>
              </select>
            </Field>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="You are their">
              <select name="relationship" defaultValue="daughter">
                <option value="spouse">Wife or husband</option>
                <option value="daughter">Daughter</option>
                <option value="son">Son</option>
                <option value="daughter_in_law">Daughter-in-law</option>
                <option value="sibling">Sister or brother</option>
                <option value="grandchild">Grandchild</option>
                <option value="friend_neighbor">Friend or neighbor</option>
                <option value="other">Other family</option>
              </select>
            </Field>
            <Field label="Where they live">
              <select name="localityFips" defaultValue={account.localityFips}>
                {localities.map((l) => (
                  <option key={l.fips} value={l.fips}>
                    {l.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="flex gap-3 items-center">
              <input type="checkbox" name="livesWith" defaultChecked />
              <span>We live in the same home</span>
            </label>
            <label className="flex gap-3 items-center">
              <input type="checkbox" name="hasDiagnosis" defaultChecked />
              <span>A doctor has said they have dementia</span>
            </label>
            <label className="flex gap-3 items-center">
              <input type="checkbox" name="medicaid" />
              <span>They also have Medicaid</span>
            </label>
            <label className="flex gap-3 items-center">
              <input type="checkbox" name="hasBpCuff" />
              <span>I have a blood pressure cuff at home</span>
            </label>
          </div>
          <Field label="Hours a week you spend caring for them, roughly">
            <input name="hoursPerWeek" type="number" min={0} max={168} defaultValue={30} className="max-w-32" />
          </Field>
        </div>

        <ConsentFields patientName="the person named above" signerName={`${account.givenName} ${account.familyName}`} />

        <button className="btn btn-primary btn-lg w-full mt-6">Sign and open the record</button>
      </form>
    </div>
  );
}
