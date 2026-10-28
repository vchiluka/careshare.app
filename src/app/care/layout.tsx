import Link from "next/link";
import { signOutCaregiver } from "@/app/actions";
import { getCaregiverSession } from "@/lib/session";
import { getRepository } from "@/lib/store";
import { caregiverAccess } from "@/lib/services/household-view";

export const dynamic = "force-dynamic";

const tabs = [
  { href: "/care/home", label: "Home" },
  { href: "/care/plan", label: "Care plan" },
  { href: "/care/medications", label: "Medicines" },
  { href: "/care/log", label: "Log" },
  { href: "/care/visits", label: "Visits & rides" },
  { href: "/care/messages", label: "Messages" },
  { href: "/care/checkin", label: "My check-in" },
  { href: "/care/resources", label: "Help nearby" },
  { href: "/care/learn", label: "Guides" },
  { href: "/care/help-now", label: "Help now" },
];

export default async function CareLayout({ children }: LayoutProps<"/care">) {
  const s = await getCaregiverSession();
  const repo = getRepository();
  const h = s?.householdId ? await repo.household(s.householdId) : undefined;
  const c = h?.caregivers.find((x) => x.id === s?.caregiverId);
  const account = s?.accountId && !c ? await repo.account(s.accountId) : undefined;
  const access = caregiverAccess(c, h, h ? await repo.asOf() : undefined);
  return (
    <div data-face="care" className="min-h-screen flex flex-col">
      <header className="border-b border-rule bg-paper-2">
        <div className="max-w-4xl mx-auto px-5 py-4 flex items-center justify-between gap-4">
          <Link href={c ? "/care/home" : account ? "/care/start" : "/care"} className="display text-2xl leading-none">
            CareShare
          </Link>
          {c && h ? (
            <div className="flex items-center gap-4 text-sm">
              <span className="text-ink-2">
                {c.givenName}, caring for <strong>{h.patient.givenName}</strong>
              </span>
              <form action={signOutCaregiver}>
                <button className="btn btn-quiet">Sign out</button>
              </form>
            </div>
          ) : account ? (
            <div className="flex items-center gap-4 text-sm">
              <span className="text-ink-2">{account.givenName}, setting up</span>
              <form action={signOutCaregiver}>
                <button className="btn btn-quiet">Sign out</button>
              </form>
            </div>
          ) : (
            <Link href="/" className="text-sm text-ink-3">
              About CareShare
            </Link>
          )}
        </div>
        {c && access.record && (
          <nav className="max-w-4xl mx-auto px-5 tabs border-b-0" aria-label="Caregiver sections">
            {tabs.map((t) => (
              <Link key={t.href} href={t.href}>
                {t.label}
              </Link>
            ))}
          </nav>
        )}
      </header>
      <main className="flex-1">
        <div className="max-w-4xl mx-auto px-5 py-8">{children}</div>
      </main>
      <footer className="no-print border-t border-rule">
        <div className="max-w-4xl mx-auto px-5 py-4 text-sm text-ink-3 flex flex-wrap gap-x-6 gap-y-1">
          <span>Synthetic data only. No real patients or caregivers.</span>
          <span>Nothing here replaces calling 911 in an emergency.</span>
        </div>
      </footer>
    </div>
  );
}
