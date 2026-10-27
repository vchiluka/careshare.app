import Link from "next/link";
import { signOutStaff } from "@/app/actions";
import { getStaffSession } from "@/lib/session";
import { getRepository } from "@/lib/store";

export const dynamic = "force-dynamic";

const nav = [
  { href: "/clinic", label: "Today" },
  { href: "/clinic/households", label: "Households" },
  { href: "/clinic/proxy", label: "Proxy confirmations" },
  { href: "/clinic/escalations", label: "Escalations" },
  { href: "/clinic/outcomes", label: "Pilot outcomes" },
  { href: "/clinic/enroll", label: "Enroll a household" },
  { href: "/clinic/integrations", label: "Integrations" },
  { href: "/clinic/audit", label: "Evidence trail" },
];

export default async function ClinicLayout({ children }: LayoutProps<"/clinic">) {
  const repo = getRepository();
  const [s, asOf, staff] = await Promise.all([getStaffSession(), repo.asOf(), repo.staff()]);
  const me = staff.find((x) => x.id === s?.staffId);
  return (
    <div data-face="clinic" className="min-h-screen flex">
      <aside className="w-60 shrink-0 border-r border-rule bg-paper-2 flex flex-col no-print">
        <div className="px-5 pt-6 pb-4">
          <Link href="/clinic" className="display text-2xl leading-none">
            CareShare
          </Link>
          <p className="text-xs text-ink-3 mt-1.5">Clinic Console</p>
        </div>
        {me && me.status === "active" && (
          <nav className="flex flex-col px-3 gap-0.5" aria-label="Console">
            {[...nav, ...(me.isAdmin ? [{ href: "/clinic/admin", label: "Admin: staff & leads" }] : [])].map((n) => (
              <Link key={n.href} href={n.href} className="rounded px-2 py-1.5 text-sm text-ink-2 hover:bg-white hover:text-ink">
                {n.label}
              </Link>
            ))}
          </nav>
        )}
        <div className="mt-auto px-5 py-5 text-xs text-ink-3 leading-relaxed">
          {me ? (
            <>
              <p className="text-ink-2 font-semibold">{me.name}</p>
              <p>{me.credentials}</p>
              <form action={signOutStaff} className="mt-2">
                <button className="underline">Sign out</button>
              </form>
            </>
          ) : (
            <p>Not signed in</p>
          )}
          <p className="mt-3">Demo clock: {asOf}</p>
          <p>Synthetic data only.</p>
          <Link href="/" className="underline">About CareShare</Link>
        </div>
      </aside>
      <main className="flex-1 min-w-0">
        <div className="max-w-6xl px-8 py-8">{children}</div>
      </main>
    </div>
  );
}
