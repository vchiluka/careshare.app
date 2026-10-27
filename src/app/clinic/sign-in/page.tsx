import { redirect } from "next/navigation";
import { signInAsStaff, startStaffVerification } from "@/app/actions";
import { Notice } from "@/components/ui";
import { ROLE_LABEL } from "@/lib/domain/labels";
import { describeIdentityProviders } from "@/lib/integrations/identity";
import { getStaffSession } from "@/lib/session";
import { getRepository } from "@/lib/store";

export const dynamic = "force-dynamic";

const roleLabel = ROLE_LABEL;

export default async function StaffSignIn({ searchParams }: PageProps<"/clinic/sign-in">) {
  const sp = await searchParams;
  if (await getStaffSession()) redirect("/clinic");
  const repo = getRepository();
  const [staff, sites] = await Promise.all([repo.staff(), repo.sites()]);
  const providers = describeIdentityProviders();
  const msg = sp.verify === "failed" ? `Verification did not go through: ${String(sp.reason ?? "")}` : sp.verify === "error" ? (sp.reason ? `Sign-in could not start: ${String(sp.reason)}` : "The sign-in link expired. Please start again.") : null;
  return (
    <div className="max-w-xl">
      <h1>Clinic sign-in</h1>
      {msg && <Notice kind="amber">{msg}</Notice>}
      <p className="mt-2 text-ink-2">Staff sign in with CLEAR or ID.me, the same identity verification caregivers use. First time through, an administrator approves you and sets your role and site before you see anything.</p>
      <div className="grid sm:grid-cols-2 gap-3 mt-5">
        {providers.map((p) =>
          p.configError ? (
            <div key={p.id} className="card opacity-80">
              <div className="font-semibold">{p.displayName}</div>
              <div className="text-xs text-amber mt-1">Not configured: {p.configError}</div>
            </div>
          ) : (
            <form key={p.id} action={startStaffVerification} className="card">
              <input type="hidden" name="provider" value={p.id} />
              <div className="font-semibold">{p.displayName}</div>
              <label className="field mt-2">
                <span>Work email (optional)</span>
                <input name="email" type="email" placeholder="you@clinic.org" />
              </label>
              <button className="btn btn-primary mt-3 w-full">Sign in with {p.displayName}</button>
              <div className="text-xs text-ink-3 mt-2">{p.mode === "mock" ? "Demo mode: a stand-in page plays the vendor." : "Live sandbox."}</div>
            </form>
          ),
        )}
      </div>

      <h2 className="mt-10">Demo: pick a role at {sites[0]?.orgName}</h2>
      <p className="text-sm text-ink-2 mt-1">Stands in for the clinic&rsquo;s single sign-on. Dr. Pannell is the administrator.</p>
      <div className="mt-4 space-y-2">
        {staff.filter((s) => s.status !== "disabled").map((s) => (
          <form key={s.id} action={signInAsStaff} className="card flex items-center justify-between py-3">
            <input type="hidden" name="staffId" value={s.id} />
            <div>
              <div className="font-semibold">{s.name}</div>
              <div className="text-sm text-ink-3">
                {roleLabel[s.role]} · {s.credentials} · {sites.find((x) => x.id === s.siteId)?.town}
                {s.isAdmin ? " · admin" : ""}
                {s.status === "pending" ? " · pending approval" : ""}
              </div>
            </div>
            <button className="btn btn-secondary">Continue</button>
          </form>
        ))}
      </div>
    </div>
  );
}
