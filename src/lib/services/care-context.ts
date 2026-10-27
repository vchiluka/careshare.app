import { redirect } from "next/navigation";
import type { Caregiver, CaregiverAccount } from "@/lib/domain/types";
import { getCaregiverSession, type CaregiverSession } from "@/lib/session";
import { getRepository } from "@/lib/store";
import { caregiverAccess, loadHouseholdView, type CareAccess, type HouseholdView } from "./household-view";

export interface CareContext {
  view: HouseholdView;
  me: Caregiver;
  access: CareAccess;
  account?: CaregiverAccount;
}

/** Caregiver pages: session required; record access decided by identity + proxy + consent, not the cookie. */
export async function requireCare(opts: { needRecord?: boolean } = {}): Promise<CareContext> {
  const s = await getCaregiverSession();
  if (!s) redirect("/care");
  if (!s.householdId || !s.caregiverId) redirect("/care/start");
  const view = await loadHouseholdView(s.householdId);
  const me = view?.h.caregivers.find((c) => c.id === s.caregiverId);
  if (!view || !me) redirect("/care");
  const access = caregiverAccess(me, view.h, view.asOf);
  if (opts.needRecord && !access.record) redirect(access.needsConsent ? "/care/consent" : "/care/home");
  const account = s.accountId ? await getRepository().account(s.accountId) : undefined;
  return { view, me, access, account };
}

export interface AccountContext {
  session: CaregiverSession;
  account: CaregiverAccount;
  asOf: string;
}

/** First-run pages for a self-registered caregiver: an account session is enough. */
export async function requireAccount(): Promise<AccountContext> {
  const s = await getCaregiverSession();
  if (!s?.accountId) redirect("/care");
  const repo = getRepository();
  const account = await repo.account(s.accountId);
  if (!account) redirect("/care");
  return { session: s, account, asOf: await repo.asOf() };
}
