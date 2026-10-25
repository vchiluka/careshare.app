import { redirect } from "next/navigation";
import type { StaffUser } from "@/lib/domain/types";
import { getStaffSession } from "@/lib/session";
import { getRepository } from "@/lib/store";

export async function requireClinic(): Promise<StaffUser> {
  const s = await getStaffSession();
  if (!s) redirect("/clinic/sign-in");
  const me = (await getRepository().staff()).find((x) => x.id === s.staffId);
  if (!me) redirect("/clinic/sign-in");
  return me;
}
