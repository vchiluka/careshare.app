import Link from "next/link";
import { signOutCaregiver } from "@/app/actions";
import { voice } from "@/lib/domain/care-terms";
import { requireCare } from "@/lib/services/care-context";

export const dynamic = "force-dynamic";

/** The rest of the sections, reached from the phone bottom bar's "More". */
export default async function More() {
  const { view, access } = await requireCare();
  const { h } = view;
  const v = voice(h.patient.term, h.patient.givenName);
  const items = [
    { href: "/care/help-now", title: "Help right now", body: "911, 988, the 24-hour dementia helpline, poison control, the clinic." },
    { href: "/care/plan", title: "Care plan", body: `${v.Them.charAt(0).toUpperCase() + v.Them.slice(1)}'s plan in plain words: what to watch for, goals, who does what.`, record: true },
    { href: "/care/messages", title: "Messages", body: "A secure thread with the care team.", record: true },
    { href: "/care/checkin", title: "My check-in", body: "Your strain, mood, blood pressure and your own doctor visit." },
    { href: "/care/resources", title: "Help nearby", body: `Respite, adult day, rides and meals in ${view.locality.name}.` },
    { href: "/care/learn", title: "Guides", body: "Short guides ordered for where things are now." },
    { href: "/care/share", title: "Share with a provider", body: "A QR code and PIN for the emergency department or a specialist.", record: true },
    { href: "/care/circle", title: "Who helps", body: "Who else is on this record; invite a family member.", record: true },
    { href: "/care/consent", title: "Your authorization", body: "What you agreed to; re-affirm or revoke.", record: true },
    { href: "/care/summary", title: "Printable summary", body: "One page for the refrigerator door or the emergency room.", record: true },
  ].filter((i) => !i.record || access.record);
  return (
    <div>
      <h1>More</h1>
      <ul className="mt-4 divide-y divide-rule">
        {items.map((i) => (
          <li key={i.href}>
            <Link href={i.href} className="block py-4">
              <div className="font-bold text-lg">{i.title}</div>
              <div className="text-ink-2 text-sm">{i.body}</div>
            </Link>
          </li>
        ))}
      </ul>
      <form action={signOutCaregiver} className="mt-8">
        <button className="btn btn-secondary inline">Sign out</button>
      </form>
    </div>
  );
}
