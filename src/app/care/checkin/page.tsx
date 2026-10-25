import { recordOwnVisit, submitBp, submitPhq2, submitZbi } from "@/app/actions";
import { Field, Notice, Pill } from "@/components/ui";
import { fmtDate, zbi12Band } from "@/lib/engine";
import { requireCare } from "@/lib/services/care-context";

export const dynamic = "force-dynamic";

/**
 * Zarit Burden Interview, 12-item short form: the demo shows paraphrased prompts. The instrument
 * is licensed (Mapi Research Trust); the licensed wording replaces these before any real use.
 */
const ZBI12 = [
  "feel you do not have enough time for yourself",
  "feel stressed between caring and your other responsibilities",
  "feel angry when you are around them",
  "feel caring has affected your relationships with others",
  "feel strained when you are around them",
  "feel your health has suffered because of caregiving",
  "feel you do not have as much privacy as you would like",
  "feel your social life has suffered",
  "feel you have lost control of your life",
  "feel uncertain what to do about them",
  "feel you should be doing more",
  "feel you could do a better job",
];
const FREQ = ["Never", "Rarely", "Sometimes", "Quite often", "Nearly always"];
const PHQ = ["Not at all", "Several days", "More than half the days", "Nearly every day"];

export default async function CheckIn({ searchParams }: PageProps<"/care/checkin">) {
  const sp = await searchParams;
  const { view, me } = await requireCare();
  const { asOf } = view;
  const lastZ = me.health.zbi.at(-1);
  const lastP = me.health.phq2.at(-1);
  const lastBp = [...me.health.bp].sort((a, b) => a.date.localeCompare(b.date)).at(-1);
  const done = sp.done;
  return (
    <div>
      <h1>My check-in</h1>
      <p className="mt-2 text-ink-2">
        {me.givenName}, you are the second patient in this household. Seven in ten caregivers have a chronic condition of their own, and the strain is real. These check-ins are about you. The clinic sees them, uses them to adjust the plan, and will reach out if something needs a closer look. Nothing here is a diagnosis.
      </p>
      {done === "zbi" && <div className="mt-4"><Notice kind="green">Strain check-in saved. {lastZ && lastZ.total >= 17 ? "Your score is high. The clinic will be in touch about respite; you do not have to wait for them to call." : "Thank you. Keep doing these; the pattern over time is what helps."}</Notice></div>}
      {done === "phq2" && <div className="mt-4"><Notice kind={lastP && lastP.total >= 3 ? "amber" : "green"}>{lastP && lastP.total >= 3 ? "Thank you for answering. Your answers suggest it would be worth talking with your own doctor or the clinic's counselor; the care team will offer to set that up. If you are in crisis, call or text 988." : "Saved. Thank you."}</Notice></div>}
      {done === "bp" && <div className="mt-4"><Notice kind={lastBp && (lastBp.systolic >= 180 || lastBp.diastolic >= 120) ? "red" : "green"}>{lastBp && (lastBp.systolic >= 180 || lastBp.diastolic >= 120) ? "That reading is very high. Sit quietly for five minutes and take it again. If it is still that high, or you have a headache, chest pain, or trouble seeing or speaking, call 911." : "Reading saved."}</Notice></div>}
      {done === "visit" && <div className="mt-4"><Notice kind="green">Saved. Good.</Notice></div>}

      <div className="grid md:grid-cols-2 gap-5 mt-8">
        <div className="card">
          <div className="flex items-baseline justify-between">
            <h2>How strained am I?</h2>
            {lastZ && (
              <Pill kind={zbi12Band(lastZ.total) === "high" ? "red" : zbi12Band(lastZ.total) === "moderate" ? "amber" : "green"}>
                Last: {lastZ.total}/48 on {fmtDate(lastZ.date)}
              </Pill>
            )}
          </div>
          <p className="text-sm text-ink-3 mt-1">Twelve quick questions. Answer for the past month.</p>
          <form action={submitZbi} className="mt-4 space-y-4">
            {ZBI12.map((q, i) => (
              <fieldset key={i}>
                <legend className="text-[0.95rem]">
                  {i + 1}. Do you {q}?
                </legend>
                <div className="choice mt-1.5 relative">
                  {FREQ.map((f, v) => (
                    <label key={v}>
                      <input type="radio" name={`q${i + 1}`} value={v} required defaultChecked={v === 0} />
                      {f}
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
            <button className="btn btn-primary w-full">Save strain check-in</button>
          </form>
        </div>

        <div className="space-y-5">
          <div className="card">
            <div className="flex items-baseline justify-between">
              <h2>Mood, past two weeks</h2>
              {lastP && <Pill kind={lastP.total >= 3 ? "amber" : "green"}>Last: {lastP.total}/6 on {fmtDate(lastP.date)}</Pill>}
            </div>
            <form action={submitPhq2} className="mt-4 space-y-4">
              {["Little interest or pleasure in doing things", "Feeling down, depressed, or hopeless"].map((q, i) => (
                <fieldset key={i}>
                  <legend className="text-[0.95rem]">{q}</legend>
                  <div className="choice mt-1.5 relative" style={{ gridTemplateColumns: "repeat(4, minmax(0,1fr))" }}>
                    {PHQ.map((f, v) => (
                      <label key={v}>
                        <input type="radio" name={`p${i + 1}`} value={v} required defaultChecked={v === 0} />
                        {f}
                      </label>
                    ))}
                  </div>
                </fieldset>
              ))}
              <button className="btn btn-primary w-full">Save</button>
            </form>
            <p className="text-xs text-ink-3 mt-3">PHQ-2. If you are thinking about harming yourself, call or text 988 now.</p>
          </div>

          <div className="card">
            <div className="flex items-baseline justify-between">
              <h2>My blood pressure</h2>
              {lastBp && <Pill kind={lastBp.systolic >= 140 || lastBp.diastolic >= 90 ? "amber" : "green"}>Last: {lastBp.systolic}/{lastBp.diastolic} on {fmtDate(lastBp.date)}</Pill>}
            </div>
            <p className="text-sm text-ink-3 mt-1">{me.health.hasHomeBpCuff ? "From your home cuff. Sit for five minutes first, arm at heart level." : "The pilot lends home cuffs; ask the coordinator for one."}</p>
            <form action={submitBp} className="mt-4 flex items-end gap-3">
              <Field label="Top number">
                <input name="systolic" type="number" inputMode="numeric" min={60} max={260} required className="w-28" />
              </Field>
              <Field label="Bottom number">
                <input name="diastolic" type="number" inputMode="numeric" min={30} max={160} required className="w-28" />
              </Field>
              <button className="btn btn-primary">Save</button>
            </form>
          </div>

          <div className="card">
            <h2>My own doctor</h2>
            <p className="text-sm text-ink-2 mt-1">
              {me.health.ownPcpLastVisit ? `Last visit ${fmtDate(me.health.ownPcpLastVisit)}.` : "No visit on record."} {me.health.ownPcpNextScheduled ? `Next: ${fmtDate(me.health.ownPcpNextScheduled)}.` : ""} The clinic can arrange care for {view.h.patient.givenName} while you go.
            </p>
            <form action={recordOwnVisit} className="mt-3 flex flex-wrap items-end gap-3">
              <Field label="Date">
                <input name="date" type="date" defaultValue={asOf} />
              </Field>
              <Field label="This is">
                <select name="when">
                  <option value="had">a visit I had</option>
                  <option value="scheduled">a visit I scheduled</option>
                </select>
              </Field>
              <button className="btn btn-secondary">Save</button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
