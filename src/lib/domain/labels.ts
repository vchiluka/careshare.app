import type { StaffRole } from "./types";

export const ROLE_LABEL: Record<StaffRole, string> = {
  physician: "Physician",
  np_pa: "NP / PA",
  rn: "RN care coordinator",
  ma: "Medical assistant",
  coordinator: "Enrollment coordinator",
  ot: "Occupational therapist",
  behavioral_health: "Behavioral health",
  admin: "Administrator",
};
