import Link from "next/link";
import { headers } from "next/headers";
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
  { href: "/care/share", label: "Share" },
  { href: "/care/circle", label: "Who helps" },
  { href: "/care/help-now", label: "Help now" },
];

/** Phone bottom bar: the four things a caregiver does most, plus More. */
const bottom = [
  { href: "/care/home", label: "Home", d: "M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" },
  { href: "/care/medications", label: "Medicines", d: "M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm0 8h10M12 7v8" },
  { href: "/care/log", label: "Log", d: "M4 5h16M4 12h16M4 19h10" },
  { href: "/care/visits", label: "Visits", d: "M5 4h14a1 1 0 0 1 1 1v15H4V5a1 1 0 0 1 1-1zm0 5h14M8 2v4m8-4v4" },
  { href: "/care/more", label: "More", d: "M5 12h.01M12 12h.01M19 12h.01" },
];

export default async function CareLayout({ children }: LayoutProps<"/care">) {
  const s = await getCaregiverSession();
  const repo = getRepository();
  const h = s?.householdId ? await repo.household(s.householdId) : undefined;
  const c = h?.caregivers.find((x) => x.id === s?.caregiverId);
  const account = s?.accountId && !c ? await repo.account(s.accountId) : undefined;
  const access = caregiverAccess(c, h, h ? await repo.asOf() : undefined);
  const path = (await headers()).get("x-pathname") ?? "";
  const current = (href: string) => (path === href || (href !== "/care/home" && path.startsWith(href)) ? "page" : undefined);
  const signOut = (
    <form action={signOutCaregiver}>
      <button className="btn btn-quiet inline text-sm px-2">Sign out</button>
    </form>
  );
  return (
    <div data-face="care" className="min-h-screen flex flex-col">
      <header className="border-b border-rule bg-paper-2 sticky top-0 z-20 md:static">
        <div className="max-w-4xl mx-auto px-4 md:px-5 py-3 md:py-4 flex items-center justify-between gap-3">
          <Link href={c ? "/care/home" : account ? "/care/start" : "/care"} className="display text-2xl leading-none shrink-0">
            CareShare
          </Link>
          {c && h ? (
            <div className="flex items-center gap-3 text-sm min-w-0">
              <span className="text-ink-2 truncate">
                <span className="hidden sm:inline">{c.givenName}, caring for </span>
                <strong>{h.patient.givenName}</strong>
              </span>
              {signOut}
            </div>
          ) : account ? (
            <div className="flex items-center gap-3 text-sm min-w-0">
              <span className="text-ink-2 truncate">{account.givenName}, setting up</span>
              {signOut}
            </div>
          ) : (
            <Link href="/" className="text-sm text-ink-3">
              About CareShare
            </Link>
          )}
        </div>
        {c && access.record && (
          <nav className="care-topnav max-w-4xl mx-auto px-5 tabs border-b-0" aria-label="Caregiver sections">
            {tabs.map((t) => (
              <Link key={t.href} href={t.href} aria-current={current(t.href)}>
                {t.label}
              </Link>
            ))}
          </nav>
        )}
      </header>
      <main className="flex-1">
        <div className="max-w-4xl mx-auto px-4 md:px-5 py-6 md:py-8">{children}</div>
      </main>
      <footer className="no-print border-t border-rule">
        <div className="max-w-4xl mx-auto px-4 md:px-5 py-4 text-sm text-ink-3 flex flex-wrap gap-x-6 gap-y-1">
          <span>Synthetic data only. No real patients or caregivers.</span>
          <span>Nothing here replaces calling 911 in an emergency.</span>
        </div>
      </footer>
      {c && access.record && (
        <nav className="bottombar" aria-label="Caregiver sections">
          {bottom.map((b) => (
            <Link key={b.href} href={b.href} aria-current={current(b.href)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d={b.d} />
              </svg>
              {b.label}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}
