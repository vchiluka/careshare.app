import { describe, expect, it } from "vitest";
import type { Caregiver, Household } from "@/lib/domain/types";
import {
  cadenceAdherence,
  cadenceStatus,
  computeSignals,
  determineStage,
  determineTier,
  outcomeReport,
  phq2Total,
  reconcile,
  zbi12Band,
  zbi12Total,
} from "..";

const AS_OF = "2026-10-24";

function caregiver(over: Partial<Caregiver> = {}): Caregiver {
  return {
    id: "cg1",
    givenName: "Denise",
    familyName: "Hairston",
    birthDate: "1964-03-02",
    relationship: "daughter",
    livesWithPatient: true,
    localityFips: "51590",
    phone: "434-555-0100",
    access: { smartphone: true, broadband: "ok", preferredChannel: "app" },
    isPrimary: true,
    identity: { status: "verified", provider: "idme", assurance: "IAL2", authenticator: "AAL2", verifiedOn: "2026-09-01", subject: "idme|x", attempts: 1 },
    proxy: { status: "confirmed", consentRecordedOn: "2026-09-02", consentBasis: "patient", confirmedOn: "2026-09-02", confirmedBy: "st1", scope: ["care_plan", "medications", "appointments", "messages", "medicare_records", "symptom_log"] },
    health: { phq2: [], bp: [], zbi: [], hasHomeBpCuff: true },
    hoursPerWeek: 40,
    ...over,
  };
}

function household(over: Partial<Household> = {}, cg: Partial<Caregiver> = {}): Household {
  return {
    id: "hh1",
    siteId: "site1",
    origin: "clinic_enrolled",
    consents: [],
    patient: {
      id: "p1",
      givenName: "Mabel",
      familyName: "Hairston",
      birthDate: "1941-06-10",
      sex: "F",
      mbi: "1EG4TE5MK72",
      coverage: { partA: true, partB: true, partC: false, partD: true, medicaid: true },
      residence: "family_home",
      localityFips: "51590",
      diagnoses: [{ code: "G30.1", display: "Alzheimer's disease with late onset" }],
    },
    caregivers: [caregiver(cg)],
    status: "active",
    enrolledOn: "2026-08-01",
    referralSource: "clinic",
    staging: { cdrGlobal: 2, fast: "6a", assessedOn: "2026-08-01", assessedBy: "st1" },
    carePlan: { tier: "MODERATE_DYAD", contactCadenceDays: 14, goals: [], watchFor: [], whoToCall: [], reviewedOn: "2026-10-01" },
    medications: [
      { id: "m1", name: "donepezil", strength: "10 mg", sig: "nightly", source: "clinic", status: "active" },
      { id: "m2", name: "lisinopril", strength: "20 mg", sig: "daily", source: "clinic", status: "active" },
    ],
    medicareFills: [
      { ndc: "1", name: "donepezil", strength: "10 mg", fillOn: "2026-10-01", daysSupply: 30 },
      { ndc: "2", name: "lisinopril", strength: "20 mg", fillOn: "2026-05-01", daysSupply: 30 },
      { ndc: "3", name: "quetiapine", strength: "25 mg", fillOn: "2026-09-20", daysSupply: 30 },
    ],
    medicare: { connected: true, mode: "mock", lastSyncOn: "2026-10-20" },
    symptomLog: [],
    appointments: [],
    messages: [],
    contacts: [{ id: "c1", date: "2026-10-15", kind: "phone", byStaffId: "st1", minutes: 20, summary: "Check-in", supports: ["care_management"] }],
    referrals: [],
    escalations: [],
    edVisits: [],
    summaries: [],
    lastAnnualWellnessOn: "2026-03-01",
    lastCognitiveAssessmentOn: "2026-03-01",
    ...over,
  };
}

describe("staging and tier", () => {
  it("CDR 1 / FAST 4 is mild; CDR 2 / FAST 6a is moderate/severe", () => {
    expect(determineStage({ cdrGlobal: 1, fast: "4" }).stage).toBe("mild");
    expect(determineStage({ cdrGlobal: 2, fast: "6a" }).stage).toBe("moderate_severe");
  });
  it("flags a conflict and lets CDR govern", () => {
    const r = determineStage({ cdrGlobal: 2, fast: "4" });
    expect(r.conflict).toBe(true);
    expect(r.stage).toBe("moderate_severe");
  });
  it("CDR 0.5 does not stage", () => {
    expect(determineTier({ cdrGlobal: 0.5, assessedOn: AS_OF, assessedBy: "x" }, true, 5).tier).toBeNull();
  });
  it("splits moderate from high by ZBI-12 at 17", () => {
    const st = { cdrGlobal: 2 as const, assessedOn: AS_OF, assessedBy: "x" };
    expect(determineTier(st, true, 16).tier).toBe("MODERATE_DYAD");
    expect(determineTier(st, true, 17).tier).toBe("HIGH_DYAD");
    expect(determineTier(st, false).tier).toBe("MOD_HIGH_INDIVIDUAL");
    expect(determineTier({ ...st, cdrGlobal: 1 }, true).tier).toBe("LOW_DYAD");
    expect(determineTier({ ...st, cdrGlobal: 1 }, false).tier).toBe("LOW_INDIVIDUAL");
  });
  it("needs a ZBI to tier a moderate/severe dyad", () => {
    const r = determineTier({ cdrGlobal: 3, assessedOn: AS_OF, assessedBy: "x" }, true);
    expect(r.tier).toBeNull();
    expect(r.blockers[0]).toMatch(/ZBI-12/);
  });
  it("scores instruments", () => {
    expect(zbi12Total(new Array(12).fill(2))).toBe(24);
    expect(() => zbi12Total(new Array(11).fill(1))).toThrow();
    expect(zbi12Band(9)).toBe("low");
    expect(zbi12Band(16)).toBe("moderate");
    expect(zbi12Band(17)).toBe("high");
    expect(phq2Total([2, 1])).toBe(3);
  });
});

describe("cadence", () => {
  it("is overdue when the last contact is older than the cadence", () => {
    const c = cadenceStatus("HIGH_DYAD", [{ id: "c", date: "2026-10-10", kind: "phone", byStaffId: "s", minutes: 10, summary: "", supports: [] }], AS_OF);
    expect(c.state).toBe("overdue");
    expect(c.daysOverdue).toBe(7);
  });
  it("is due soon within three days of the next due date", () => {
    const c = cadenceStatus("MODERATE_DYAD", [{ id: "c", date: "2026-10-12", kind: "phone", byStaffId: "s", minutes: 10, summary: "", supports: [] }], AS_OF);
    expect(c.state).toBe("due_soon");
  });
  it("adherence counts periods with a contact", () => {
    const contacts = ["2026-08-05", "2026-09-05", "2026-10-05"].map((d, i) => ({ id: String(i), date: d, kind: "phone" as const, byStaffId: "s", minutes: 10, summary: "", supports: [] }));
    expect(cadenceAdherence("LOW_DYAD", contacts, AS_OF, 90)).toBe(100);
    expect(cadenceAdherence("HIGH_DYAD", contacts, AS_OF, 90)).toBeLessThan(50);
  });
});

describe("reconciliation", () => {
  it("finds a fill not on the list and a listed drug not filled", () => {
    const d = reconcile(household(), AS_OF);
    expect(d.find((x) => x.kind === "FILLED_NOT_LISTED")?.name).toMatch(/quetiapine/);
    expect(d.find((x) => x.kind === "LISTED_NOT_FILLED")?.name).toMatch(/lisinopril/);
    expect(d.find((x) => x.name.match(/donepezil/))).toBeUndefined();
  });
  it("stays quiet when Medicare is not connected", () => {
    const d = reconcile(household({ medicare: { connected: false } }), AS_OF);
    expect(d.filter((x) => x.severity === "warning")).toHaveLength(0);
  });
});

describe("signals", () => {
  it("raises a critical fall signal within 7 days", () => {
    const s = computeSignals(household({ symptomLog: [{ id: "e", date: "2026-10-22", kind: "fall", severity: 2, note: "Slipped in bathroom", reportedBy: "cg1" }] }), AS_OF);
    expect(s[0].rule).toBe("FALL_REPORTED");
    expect(s[0].severity).toBe("critical");
  });
  it("pairs urinary symptoms with acute confusion as UTI signs", () => {
    const s = computeSignals(
      household({
        symptomLog: [
          { id: "a", date: "2026-10-21", kind: "urinary", severity: 1, note: "Going more often", reportedBy: "cg1" },
          { id: "b", date: "2026-10-23", kind: "confusion", severity: 3, note: "Did not know me this morning", reportedBy: "cg1" },
        ],
      }),
      AS_OF,
    );
    expect(s.map((x) => x.rule)).toContain("UTI_SIGNS");
  });
  it("routes a positive PHQ-2 and clears once routed", () => {
    const pos = household({}, { health: { phq2: [{ date: "2026-10-20", items: [2, 1], total: 3 }], bp: [], zbi: [], hasHomeBpCuff: false } });
    expect(computeSignals(pos, AS_OF).map((x) => x.rule)).toContain("PHQ2_POSITIVE");
    const routed = household({}, { health: { phq2: [{ date: "2026-10-20", items: [2, 1], total: 3, routedOn: "2026-10-21" }], bp: [], zbi: [], hasHomeBpCuff: false } });
    expect(computeSignals(routed, AS_OF).map((x) => x.rule)).not.toContain("PHQ2_POSITIVE");
  });
  it("flags a blood-pressure crisis and elevated runs separately", () => {
    const crisis = household({}, { health: { phq2: [], zbi: [], hasHomeBpCuff: true, bp: [{ date: "2026-10-23", systolic: 184, diastolic: 102, source: "home_cuff" }] } });
    expect(computeSignals(crisis, AS_OF).map((x) => x.rule)).toContain("BP_CRISIS");
    const elevated = household({}, {
      health: {
        phq2: [],
        zbi: [],
        hasHomeBpCuff: true,
        bp: [
          { date: "2026-10-10", systolic: 148, diastolic: 92, source: "home_cuff" },
          { date: "2026-10-20", systolic: 151, diastolic: 88, source: "home_cuff" },
        ],
      },
    });
    const rules = computeSignals(elevated, AS_OF).map((x) => x.rule);
    expect(rules).toContain("BP_ELEVATED");
    expect(rules).not.toContain("BP_CRISIS");
  });
  it("flags high and rising burden", () => {
    const high = household({}, { health: { phq2: [], bp: [], hasHomeBpCuff: false, zbi: [{ date: "2026-10-01", items: [], total: 22, context: "check_in" }] } });
    expect(computeSignals(high, AS_OF).map((x) => x.rule)).toContain("BURDEN_HIGH");
    const rising = household({}, {
      health: {
        phq2: [],
        bp: [],
        hasHomeBpCuff: false,
        zbi: [
          { date: "2026-08-01", items: [], total: 8, context: "baseline" },
          { date: "2026-10-01", items: [], total: 13, context: "check_in" },
        ],
      },
    });
    expect(computeSignals(rising, AS_OF).map((x) => x.rule)).toContain("BURDEN_RISING");
  });
  it("gates on identity before proxy", () => {
    const unverified = household({}, { identity: { status: "pending", attempts: 1 } });
    const rules = computeSignals(unverified, AS_OF).map((x) => x.rule);
    expect(rules).toContain("IDENTITY_NOT_VERIFIED");
    expect(rules).not.toContain("PROXY_NOT_CONFIRMED");
    const verifiedNoProxy = household({}, { proxy: { status: "requested", requestedOn: "2026-10-20", scope: [] } });
    expect(computeSignals(verifiedNoProxy, AS_OF).map((x) => x.rule)).toContain("PROXY_NOT_CONFIRMED");
  });
  it("raises medication discrepancy unless reconciled recently", () => {
    expect(computeSignals(household(), AS_OF).map((x) => x.rule)).toContain("MED_DISCREPANCY");
    expect(computeSignals(household({ medReconciliationCompletedOn: "2026-10-20" }), AS_OF).map((x) => x.rule)).not.toContain("MED_DISCREPANCY");
  });
  it("flags an upcoming visit without a ride", () => {
    const h = household({
      appointments: [{ id: "a", date: "2026-10-28", purpose: "annual_wellness", withName: "Dr. Pannell", location: "Chatham", status: "scheduled", transport: { needed: true, arranged: false }, forPerson: "patient" }],
    });
    expect(computeSignals(h, AS_OF).map((x) => x.rule)).toContain("TRANSPORT_UNARRANGED");
  });
});

describe("outcomes", () => {
  it("counts only Appendix A localities and computes shares", () => {
    const localities = [
      { fips: "51590", name: "Danville City", region: "southside" as const, appendixA: true, pilotPhase: 1 as const },
      { fips: "51059", name: "Fairfax County", region: "southside" as const, appendixA: false, pilotPhase: 0 as const },
    ];
    const hh = [household(), household({ id: "hh2", patient: { ...household().patient, id: "p2", localityFips: "51059" } })];
    const r = outcomeReport(hh, localities, AS_OF);
    expect(r.measures.find((m) => m.id === "households")?.value).toBe(1);
    expect(r.measures.find((m) => m.id === "verified")?.value).toBe(100);
    expect(r.measures.find((m) => m.id === "awv")?.value).toBe(100);
  });
});
