import { logSymptom } from "@/app/actions";
import { Field, Pill } from "@/components/ui";
import { fmtDate } from "@/lib/engine";
import { requireCare } from "@/lib/services/care-context";

export const dynamic = "force-dynamic";

const kinds: { key: string; label: string; hint: string }[] = [
  { key: "fall", label: "A fall", hint: "Even without injury" },
  { key: "confusion", label: "More confused than usual", hint: "Sudden, over a day or two" },
  { key: "behavior", label: "Agitation or aggression", hint: "Hitting, yelling, frightened you" },
  { key: "wandering", label: "Tried to leave or got lost", hint: "" },
  { key: "sleep", label: "Bad night", hint: "Up, restless, day and night mixed" },
  { key: "appetite", label: "Not eating or drinking", hint: "" },
  { key: "urinary", label: "Bathroom changes", hint: "Wetting, going more often, pain" },
  { key: "pain", label: "Pain", hint: "Holding, wincing, limping" },
  { key: "mood", label: "Sad, tearful, withdrawn", hint: "" },
  { key: "other", label: "Something else", hint: "" },
];

export default async function CareLog() {
  const { view, me } = await requireCare({ needRecord: true });
  const { h, asOf } = view;
  const entries = [...h.symptomLog].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30);
  return (
    <div>
      <h1>Log</h1>
      <p className="mt-2 text-ink-2">You notice things first. What you write here goes to the care team and is checked against a few patterns that mean &ldquo;call today.&rdquo; If it is an emergency, call 911 first.</p>

      <form action={logSymptom} className="card mt-6 space-y-5">
        <input type="hidden" name="date" value={asOf} />
        <fieldset>
          <legend className="font-bold">What happened?</legend>
          <div className="grid sm:grid-cols-2 gap-2 mt-3">
            {kinds.map((k, i) => (
              <label key={k.key} className="flex items-start gap-3 border border-rule rounded-xl p-3 bg-white cursor-pointer has-[:checked]:border-accent has-[:checked]:bg-accent-2">
                <input type="radio" name="kind" value={k.key} defaultChecked={i === 0} className="mt-1.5" />
                <span>
                  <span className="font-bold">{k.label}</span>
                  {k.hint && <span className="block text-sm text-ink-3">{k.hint}</span>}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="font-bold">How bad?</legend>
          <div className="flex gap-2 mt-3">
            {[
              [1, "Mild", "Noticed it"],
              [2, "Moderate", "Changed the day"],
              [3, "Severe", "Frightening or unsafe"],
            ].map(([v, l, d], i) => (
              <label key={String(v)} className="flex-1 border border-rule rounded-xl p-3 bg-white cursor-pointer text-center has-[:checked]:border-accent has-[:checked]:bg-accent-2">
                <input type="radio" name="severity" value={String(v)} defaultChecked={i === 0} className="sr-only" />
                <span className="font-bold block">{l}</span>
                <span className="text-sm text-ink-3">{d}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <Field label="In your words (optional)" hint="What you saw, when, anything different from usual.">
          <textarea name="note" placeholder="She was fine at lunch, then by supper did not know where she was." />
        </Field>
        <button className="btn btn-primary btn-lg">Save to the log</button>
      </form>

      <h2 className="mt-10">Recent entries</h2>
      <ul className="mt-3 divide-y divide-rule">
        {entries.map((e) => (
          <li key={e.id} className="py-3 flex gap-4">
            <div className="text-sm text-ink-3 w-24 shrink-0 tnum">{fmtDate(e.date)}</div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-bold">{kinds.find((k) => k.key === e.kind)?.label ?? e.kind}</span>
                <Pill kind={e.severity === 3 ? "red" : e.severity === 2 ? "amber" : "neutral"}>{["", "Mild", "Moderate", "Severe"][e.severity]}</Pill>
              </div>
              {e.note && <div className="text-ink-2">{e.note}</div>}
              {e.reportedBy !== me.id && <div className="text-xs text-ink-3">Logged by another caregiver</div>}
            </div>
          </li>
        ))}
        {entries.length === 0 && <li className="py-6 text-ink-3">Nothing logged yet.</li>}
      </ul>
    </div>
  );
}
