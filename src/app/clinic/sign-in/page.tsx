import { redirect } from "next/navigation";
import { signInAsStaff } from "@/app/actions";
import { getStaffSession } from "@/lib/session";
import { getRepository } from "@/lib/store";

export const dynamic = "force-dynamic";

const roleLabel = { physician: "Physician", np_pa: "NP / PA", rn: "RN care coordinator", ma: "Medical assistant", coordinator: "Enrollment coordinator", ot: "Occupational therapist", behavioral_health: "Behavioral health" };

export default async function StaffSignIn() {
  if (await getStaffSession()) redirect("/clinic");
  const repo = getRepository();
  const [staff, sites] = await Promise.all([repo.staff(), repo.sites()]);
  return (
    <div className="max-w-xl">
      <h1>Clinic sign-in</h1>
      <p className="mt-2 text-ink-2">In the pilot this is the clinic&rsquo;s own single sign-on. The demo lets you pick a role at {sites[0]?.orgName}.</p>
      <div className="mt-6 space-y-2">
        {staff.map((s) => (
          <form key={s.id} action={signInAsStaff} className="card flex items-center justify-between py-3">
            <input type="hidden" name="staffId" value={s.id} />
            <div>
              <div className="font-semibold">{s.name}</div>
              <div className="text-sm text-ink-3">
                {roleLabel[s.role]} · {s.credentials} · {sites.find((x) => x.id === s.siteId)?.town}
              </div>
            </div>
            <button className="btn btn-secondary">Continue</button>
          </form>
        ))}
      </div>
    </div>
  );
}
