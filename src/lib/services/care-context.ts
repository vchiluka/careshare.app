import { redirect } from "next/navigation";
import type { Caregiver } from "@/lib/domain/types";
import { getCaregiverSession } from "@/lib/session";
import { caregiverAccess, loadHouseholdView, type HouseholdView } from "./household-view";

export interface CareContext {
  view: HouseholdView;
  me: Caregiver;
  access: ReturnType<typeof caregiverAccess>;
}

/** Caregiver pages: session required; record access decided by identity + proxy, not the cookie. */
export async function requireCare(opts: { needRecord?: boolean } = {}): Promise<CareContext> {
  const s = await getCaregiverSession();
  if (!s) redirect("/care");
  const view = await loadHouseholdView(s.householdId);
  const me = view?.h.caregivers.find((c) => c.id === s.caregiverId);
  if (!view || !me) redirect("/care");
  const access = caregiverAccess(me);
  if (opts.needRecord && !access.record) redirect("/care/home");
  return { view, me, access };
}
