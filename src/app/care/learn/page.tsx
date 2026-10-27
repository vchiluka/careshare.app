import { EDUCATION_TOPIC_LABEL } from "@/lib/content/education";
import type { EducationItem, EducationTopic } from "@/lib/domain/types";
import { getCaregiverSession } from "@/lib/session";
import { getRepository } from "@/lib/store";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Education library. Open to any signed-in caregiver, record or not; ordered by the patient's stage when known. */
export default async function Learn({ searchParams }: PageProps<"/care/learn">) {
  const sp = await searchParams;
  const s = await getCaregiverSession();
  if (!s) redirect("/care");
  const repo = getRepository();
  const [items, h] = await Promise.all([repo.education(), s.householdId ? repo.household(s.householdId) : undefined]);
  const fast = h?.staging?.fast;
  const topic = typeof sp.topic === "string" ? (sp.topic as EducationTopic) : undefined;
  const topics = Object.keys(EDUCATION_TOPIC_LABEL) as EducationTopic[];
  const relevant = (x: EducationItem) => !fast || x.stages.length === 0 || x.stages.includes(fast);
  const shown = items.filter((x) => (!topic || x.topic === topic)).sort((a, b) => Number(relevant(b)) - Number(relevant(a)) || topics.indexOf(a.topic) - topics.indexOf(b.topic));
  return (
    <div className="max-w-3xl">
      <h1>Guides</h1>
      <p className="mt-2 text-ink-2">Short, plain, and ending with what to do. {fast ? `Ordered for where ${h!.patient.givenName} is now (stage ${fast}).` : "Once the clinic records a stage, these reorder to match."}</p>
      <nav className="tabs mt-6" aria-label="Topics">
        <a href="/care/learn" aria-current={!topic ? "page" : undefined}>
          All
        </a>
        {topics.map((t) => (
          <a key={t} href={`/care/learn?topic=${t}`} aria-current={topic === t ? "page" : undefined}>
            {EDUCATION_TOPIC_LABEL[t]}
          </a>
        ))}
      </nav>
      <div className="mt-6 space-y-3">
        {shown.map((x) => (
          <details key={x.id} className="card">
            <summary className="cursor-pointer">
              <span className="text-xs text-ink-3 uppercase tracking-wide">{EDUCATION_TOPIC_LABEL[x.topic]} · {x.minutes} min</span>
              <span className="block font-bold text-lg mt-0.5">{x.title}</span>
              <span className="block text-ink-2 mt-0.5">{x.summary}</span>
            </summary>
            <div className="mt-4 space-y-3 text-ink-2">
              {x.body.split("\n\n").map((p, i) => (
                <p key={i}>{p}</p>
              ))}
              <p className="text-xs text-ink-3">Adapted from: {x.source}</p>
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
