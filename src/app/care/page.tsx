import Link from "next/link";
import { redirect } from "next/navigation";
import { signInAsAccount, signInAsCaregiver } from "@/app/actions";
import { Notice, Pill } from "@/components/ui";
import { getCaregiverSession } from "@/lib/session";
import { getRepository } from "@/lib/store";

export const dynamic = "force-dynamic";

const relLabel: Record<string, string> = { spouse: "wife/husband", daughter: "daughter", son: "son", child: "son/daughter", daughter_in_law: "daughter-in-law", sibling: "sister/brother", grandchild: "grandchild", friend_neighbor: "friend and neighbor", other: "family" };

export default async function CareSignIn() {
  const repo = getRepository();
  const s = await getCaregiverSession();
  // Only follow a session that still resolves to a record. A cookie left over from a previous
  // deployment (memory store reset) would otherwise bounce between here and /care/home forever;
  // in that case render the picker and let the next sign-in overwrite the cookie.
  let stale = false;
  if (s?.householdId && s.caregiverId) {
    const h = await repo.household(s.householdId);
    if (h?.caregivers.some((c) => c.id === s.caregiverId)) redirect("/care/home");
    stale = true;
  } else if (s?.accountId) {
    if (await repo.account(s.accountId)) redirect("/care/start");
    stale = true;
  }
  const [hs, localities, allAccounts] = await Promise.all([repo.households(), repo.localities(), repo.accounts()]);
  const accounts = allAccounts.filter((a) => a.givenName); // provisional accounts (verification started, details not yet entered) stay hidden
  const featured = ["hh_hairston", "hh_tuck", "hh_simms", "hh_motley", "hh_adkins"];
  const rows = hs
    .filter((h) => h.caregivers.length > 0)
    .sort((a, b) => (featured.indexOf(a.id) === -1 ? 99 : featured.indexOf(a.id)) - (featured.indexOf(b.id) === -1 ? 99 : featured.indexOf(b.id)) || a.patient.familyName.localeCompare(b.patient.familyName));
  return (
    <div className="max-w-2xl">
      <h1>Sign in</h1>
      {stale && <Notice kind="amber">Your previous session pointed at a record that no longer exists (the demo data was reset). Pick a caregiver or register again.</Notice>}
      <p className="mt-3 text-ink-2">
        In the pilot you sign in with the same CLEAR or ID.me account that verified who you are. This demo lets you pick a caregiver instead. You still have to be verified, and the clinic still has to confirm you, before anything from the record appears.
      </p>
      <div className="card mt-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="font-bold">New here?</div>
          <div className="text-sm text-ink-2">Create your account, verify who you are, add the person you care for, and connect their Medicare records. About ten minutes.</div>
        </div>
        <Link href="/care/register" className="btn btn-primary btn-lg sm:shrink-0 text-center">Register</Link>
      </div>

      {accounts.length > 0 && (
        <>
          <h2 className="mt-10">Caregivers who registered themselves</h2>
          <p className="text-sm text-ink-2 mt-1">Clean slate: no record yet. Pick one to walk through verification, adding a patient, and Medicare.</p>
          <div className="mt-4 space-y-3">
            {accounts.map((a) => {
              const loc = localities.find((l) => l.fips === a.localityFips)?.name ?? "";
              const hasHousehold = a.householdIds.length > 0;
              const status = a.identity.status === "verified" ? (hasHousehold ? "Verified, patient added" : "Verified, no patient yet") : a.identity.status === "failed" ? "Verification failed" : a.identity.status === "pending" ? "Verification started" : "Registered, not yet verified";
              return (
                <form key={a.id} action={signInAsAccount} className="card flex items-center justify-between gap-4">
                  <input type="hidden" name="accountId" value={a.id} />
                  <div className="min-w-0">
                    <div className="font-bold">
                      {a.givenName} {a.familyName}
                    </div>
                    <div className="text-sm text-ink-2">{loc}</div>
                    <div className="mt-1.5">
                      <Pill kind={a.identity.status === "verified" ? (hasHousehold ? "green" : "amber") : "neutral"}>{status}</Pill>
                    </div>
                  </div>
                  <button className="btn btn-secondary shrink-0">Continue</button>
                </form>
              );
            })}
          </div>
        </>
      )}

      <h2 className="mt-10">Caregivers enrolled by the clinic</h2>
      <div className="mt-4 space-y-3">
        {rows.map((h) =>
          h.caregivers.map((c) => {
            const loc = localities.find((l) => l.fips === h.patient.localityFips)?.name ?? "";
            const status = c.identity.status === "verified" ? (c.proxy.status === "confirmed" ? "Verified and confirmed" : "Verified, waiting on clinic") : c.identity.status === "in_person_pending" ? "Needs in-person verification" : c.identity.status === "failed" ? "Verification failed" : c.identity.status === "pending" ? "Verification started" : "Not yet verified";
            const kind = c.identity.status === "verified" ? (c.proxy.status === "confirmed" ? "green" : "amber") : "neutral";
            return (
              <form key={c.id} action={signInAsCaregiver} className="card flex items-center justify-between gap-4">
                <input type="hidden" name="caregiverId" value={c.id} />
                <input type="hidden" name="householdId" value={h.id} />
                <div className="min-w-0">
                  <div className="font-bold">
                    {c.givenName} {c.familyName}
                  </div>
                  <div className="text-sm text-ink-2">
                    {relLabel[c.relationship]} of {h.patient.givenName} {h.patient.familyName} · {loc}
                  </div>
                  <div className="mt-1.5">
                    <Pill kind={kind}>{status}</Pill>
                  </div>
                </div>
                <button className="btn btn-secondary shrink-0">Continue</button>
              </form>
            );
          }),
        )}
      </div>
    </div>
  );
}
