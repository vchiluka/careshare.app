import { redirect } from "next/navigation";
import type { StaffUser } from "@/lib/domain/types";
import { getStaffSession } from "@/lib/session";
import { getRepository } from "@/lib/store";

/** Clinic pages: an active staff record is required. Pending staff (verified, not yet approved) see only /clinic/pending. */
export async function requireClinic(opts: { admin?: boolean } = {}): Promise<StaffUser> {
  const s = await getStaffSession();
  if (!s) redirect("/clinic/sign-in");
  const me = (await getRepository().staff()).find((x) => x.id === s.staffId);
  if (!me) redirect("/clinic/sign-in");
  if (me.status !== "active") redirect("/clinic/pending");
  if (opts.admin && !me.isAdmin) redirect("/clinic");
  return me;
}

/** The staff member behind the session regardless of status (for the pending page). */
export async function currentStaff(): Promise<StaffUser | undefined> {
  const s = await getStaffSession();
  if (!s) return undefined;
  return (await getRepository().staff()).find((x) => x.id === s.staffId);
}
