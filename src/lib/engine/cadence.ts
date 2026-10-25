/**
 * Contact cadence by tier.
 *
 * Minimum clinic-to-household contact interval, adapted from the cadence conventions in CMS's
 * published dementia care-management requirements: at least monthly for lower-complexity
 * households, at least twice monthly for moderate/severe stage, and weekly while a caregiver is
 * under high strain. A contact is any documented touch by clinic staff (phone, video, in-person,
 * secure message with clinical content, caregiver group). Caregiver self check-ins do not count.
 *
 * These are floors for the pilot; the plan can always be tighter.
 */

import type { CareTier, ContactEvent } from "@/lib/domain/types";
import { addDays, daysBetween } from "./dates";

export const CADENCE_DAYS: Record<CareTier, number> = {
  LOW_DYAD: 30,
  LOW_INDIVIDUAL: 30,
  MODERATE_DYAD: 14,
  MOD_HIGH_INDIVIDUAL: 14,
  HIGH_DYAD: 7,
};

export const CADENCE_LABEL: Record<CareTier, string> = {
  LOW_DYAD: "at least monthly",
  LOW_INDIVIDUAL: "at least monthly",
  MODERATE_DYAD: "at least twice a month",
  MOD_HIGH_INDIVIDUAL: "at least twice a month",
  HIGH_DYAD: "weekly",
};

export interface CadenceStatus {
  cadenceDays: number;
  lastContactOn?: string;
  nextDueOn?: string;
  daysOverdue: number; // negative when not yet due
  state: "no_tier" | "never_contacted" | "on_track" | "due_soon" | "overdue";
}

export function cadenceStatus(tier: CareTier | null, contacts: ContactEvent[], asOf: string, enrolledOn?: string): CadenceStatus {
  if (!tier) return { cadenceDays: 0, daysOverdue: 0, state: "no_tier" };
  const cadenceDays = CADENCE_DAYS[tier];
  const last = contacts.map((c) => c.date).sort().at(-1);
  const anchor = last ?? enrolledOn;
  if (!anchor) return { cadenceDays, daysOverdue: 0, state: "never_contacted" };
  const nextDueOn = addDays(anchor, cadenceDays);
  const daysOverdue = daysBetween(nextDueOn, asOf);
  let state: CadenceStatus["state"] = "on_track";
  if (!last) state = "never_contacted";
  else if (daysOverdue > 0) state = "overdue";
  else if (daysOverdue >= -3) state = "due_soon";
  return { cadenceDays, lastContactOn: last, nextDueOn, daysOverdue, state };
}

/** Share of the trailing window (default 90 days) in which the cadence floor was met. */
export function cadenceAdherence(tier: CareTier | null, contacts: ContactEvent[], asOf: string, windowDays = 90): number | null {
  if (!tier) return null;
  const cadence = CADENCE_DAYS[tier];
  const start = addDays(asOf, -windowDays);
  const dates = contacts.map((c) => c.date).filter((d) => d >= start && d <= asOf).sort();
  if (dates.length === 0) return 0;
  // Walk the window in cadence-length periods; a period is met if it contains a contact.
  let met = 0;
  let periods = 0;
  for (let p = start; p < asOf; p = addDays(p, cadence)) {
    const end = addDays(p, cadence);
    periods += 1;
    if (dates.some((d) => d >= p && d < end)) met += 1;
  }
  return periods === 0 ? null : Math.round((met / periods) * 100);
}
