import { redirect } from "next/navigation";
import { signInAsCaregiver } from "@/app/actions";
import { Pill } from "@/components/ui";
import { getCaregiverSession } from "@/lib/session";
import { getRepository } from "@/lib/store";

export const dynamic = "force-dynamic";

const relLabel: Record<string, string> = { spouse: "wife/husband", daughter: "daughter", son: "son", daughter_in_law: "daughter-in-law", sibling: "sister/brother", grandchild: "grandchild", friend_neighbor: "friend and neighbor", other: "family" };

export default async function CareSignIn() {
  if (await getCaregiverSession()) redirect("/care/home");
  const repo = getRepository();
  const [hs, localities] = await Promise.all([repo.households(), repo.localities()]);
  const featured = ["hh_hairston", "hh_tuck", "hh_simms", "hh_motley", "hh_adkins"];
  const rows = hs
    .filter((h) => h.caregivers.length > 0)
    .sort((a, b) => (featured.indexOf(a.id) === -1 ? 99 : featured.indexOf(a.id)) - (featured.indexOf(b.id) === -1 ? 99 : featured.indexOf(b.id)) || a.patient.familyName.localeCompare(b.patient.familyName));
  return (
    <div className="max-w-2xl">
      <h1>Sign in</h1>
      <p className="mt-3 text-ink-2">
        In the pilot you sign in with the same CLEAR or ID.me account that verified who you are. This demo lets you pick a caregiver instead. You still have to be verified, and the clinic still has to confirm you, before anything from the record appears.
      </p>
      <div className="mt-8 space-y-3">
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
