import { enrollHousehold } from "@/app/actions";
import { Field } from "@/components/ui";
import { requireClinic } from "@/lib/services/clinic-context";
import { getRepository } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function Enroll() {
  await requireClinic();
  const localities = (await getRepository().localities()).filter((l) => l.pilotPhase > 0);
  return (
    <div className="max-w-3xl">
      <h1>Enroll a household</h1>
      <p className="mt-1 text-ink-2">
        The clinic identifies a patient with a dementia diagnosis or positive cognitive screen who has a family caregiver, and makes the warm referral. Enrollment opens the caregiver&rsquo;s verification; staging and the first check-in set the tier. Synthetic data only: do not enter a real person.
      </p>
      <form action={enrollHousehold} className="mt-6 space-y-8">
        <fieldset className="card space-y-3">
          <legend className="font-semibold px-1">Patient</legend>
          <div className="grid sm:grid-cols-3 gap-3">
            <Field label="First name"><input name="givenName" required /></Field>
            <Field label="Last name"><input name="familyName" required /></Field>
            <Field label="Date of birth"><input name="birthDate" type="date" required /></Field>
          </div>
          <div className="grid sm:grid-cols-3 gap-3">
            <Field label="Sex">
              <select name="sex"><option value="F">Female</option><option value="M">Male</option></select>
            </Field>
            <Field label="Locality">
              <select name="localityFips" required>
                {localities.map((l) => (
                  <option key={l.fips} value={l.fips}>{l.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Referral source">
              <select name="referralSource">
                <option value="clinic">Clinic visit</option>
                <option value="hospital_discharge">Hospital discharge</option>
                <option value="aaa">Area Agency on Aging</option>
                <option value="directory">Directory / community</option>
                <option value="self">Family reached out</option>
              </select>
            </Field>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Dementia diagnosis (ICD-10-CM)"><input name="dxCode" placeholder="G30.1" /></Field>
            <Field label="Description"><input name="dxDisplay" placeholder="Alzheimer's disease with late onset" /></Field>
          </div>
          <div className="flex gap-6 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" name="medicaid" /> Also has Medicaid (dual)</label>
            <label className="flex items-center gap-2"><input type="checkbox" name="partC" /> Medicare Advantage</label>
          </div>
        </fieldset>
        <fieldset className="card space-y-3">
          <legend className="font-semibold px-1">Primary family caregiver (leave blank if the patient lives alone)</legend>
          <div className="grid sm:grid-cols-3 gap-3">
            <Field label="First name"><input name="cgGivenName" /></Field>
            <Field label="Last name"><input name="cgFamilyName" /></Field>
            <Field label="Date of birth"><input name="cgBirthDate" type="date" /></Field>
          </div>
          <div className="grid sm:grid-cols-3 gap-3">
            <Field label="Relationship">
              <select name="relationship">
                {["daughter", "son", "spouse", "daughter_in_law", "sibling", "grandchild", "friend_neighbor", "other"].map((r) => (
                  <option key={r} value={r}>{r.replaceAll("_", " ")}</option>
                ))}
              </select>
            </Field>
            <Field label="Mobile phone"><input name="cgPhone" placeholder="434-555-0100" /></Field>
            <Field label="Internet at home">
              <select name="broadband"><option value="ok">Broadband</option><option value="low">Poor / cellular only</option><option value="none">None</option></select>
            </Field>
          </div>
          <div className="flex gap-6 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" name="livesWith" defaultChecked /> Lives with the patient</label>
            <label className="flex items-center gap-2"><input type="checkbox" name="smartphone" defaultChecked /> Has a smartphone</label>
          </div>
          <p className="text-xs text-ink-3">No smartphone or no internet routes her to SMS prompts and in-person verification; the plan adapts.</p>
        </fieldset>
        <button className="btn btn-primary btn-lg">Enroll household</button>
      </form>
    </div>
  );
}
