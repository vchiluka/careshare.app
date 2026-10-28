import Link from "next/link";
import { voice } from "@/lib/domain/care-terms";
import { getCaregiverSession } from "@/lib/session";
import { getRepository } from "@/lib/store";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * The 2 a.m. card. Open to any signed-in caregiver, record or not, because a crisis does not wait for
 * verification. National lines are public resources; the clinic line comes from the household's site.
 */
export default async function HelpNow() {
  const s = await getCaregiverSession();
  if (!s) redirect("/care");
  const repo = getRepository();
  const h = s.householdId ? await repo.household(s.householdId) : undefined;
  const a = !h && s.accountId ? await repo.account(s.accountId) : undefined;
  const sites = await repo.sites();
  const site = h ? sites.find((x) => x.id === h.siteId) : sites.find((x) => x.localityFips === a?.localityFips);
  const v = voice(h?.patient.term, h?.patient.givenName);
  return (
    <div className="max-w-2xl">
      <h1>Help right now</h1>
      <p className="mt-2 text-ink-2">Big type, no sign-in needed once you are here. Tap a number to call.</p>
      <ul className="mt-6 space-y-3">
        <Line label="Someone is hurt, not breathing, or in danger" phone="911" note={`Say that ${v.them} has dementia. If ${v.them} is missing, call 911 at once; do not wait. Most people are found within a mile and a half of home. Keep a recent photo on your phone.`} />
        <Line label="You are at the end of your rope, or thinking about hurting yourself" phone="988" note="The Suicide and Crisis Lifeline, 24 hours, call or text. Caregivers call it too. It is not only for emergencies." />
        <Line label="Dementia helpline, any hour" phone="1-800-272-3900" note="Alzheimer's Association 24/7 Helpline: what to do about a behavior tonight, how to get through until morning, local programs." />
        <Line label="Swallowed something, wrong pills, too many pills" phone="1-800-222-1222" note="Poison Control, 24 hours. Have the bottle in your hand when you call." />
        {site && <Line label={`${site.orgName}, ${site.town}`} phone={site.phone} note="Daytime, and the after-hours line gives you the on-call clinician. Falls without injury, new confusion, not drinking, a fever: call them, not the emergency department, unless it is urgent." />}
      </ul>
      <div className="card-soft mt-6">
        <h2>Tonight, when it is not an emergency</h2>
        <ul className="mt-2 list-disc pl-5 text-ink-2 space-y-1">
          <li>Sudden confusion, fever, or new trouble urinating in {v.them}: log it in the app so the clinic sees it first thing, and call the clinic line in the morning.</li>
          <li>Agitation: lower the lights and your voice, check for pain and the bathroom, change the room. Do not argue or restrain.</li>
          <li>Wandering at night: a chime on the door, shoes and keys out of sight, and tell the clinic; they can refer you to the sheriff&rsquo;s registry and a locator program.</li>
          <li>You have not slept in days: say so to the clinic. Respite exists in your county, and asking for it early is the point.</li>
        </ul>
        <div className="mt-4 flex flex-wrap gap-3">
          {h && <Link href="/care/log" className="btn btn-primary">Log what happened</Link>}
          <Link href="/care/learn?topic=behaviors" className="btn btn-secondary">Guides on behavior changes</Link>
        </div>
      </div>
    </div>
  );
}

function Line({ label, phone, note }: { label: string; phone: string; note?: string }) {
  return (
    <li className="card py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="font-bold text-lg">{label}</div>
        <a href={`tel:${phone.replace(/[^0-9+]/g, "")}`} className="display text-2xl tnum">
          {phone}
        </a>
      </div>
      {note && <p className="text-sm text-ink-2 mt-1">{note}</p>}
    </li>
  );
}
