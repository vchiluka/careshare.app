/**
 * Synthetic seed for the CareShare pilot demo.
 *
 * Everything here is invented: people, clinics, phone numbers, listings. Localities are real
 * Virginia places from Appendix A of RFA C-27-002 because the pilot plan names them; nothing
 * else maps to a real person or organization. Fixed PRNG, so the output is reproducible.
 *
 *   npm run seed   → data/seed/seed.json (also runs before every build)
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type {
  Appointment,
  Caregiver,
  CaregiverRelationship,
  ClinicSite,
  CommunityResource,
  ContactEvent,
  Escalation,
  Household,
  Locality,
  Medication,
  Message,
  Referral,
  SeedData,
  StaffUser,
  SymptomEntry,
} from "../src/lib/domain/types";
import { addDays, buildMonthlySummary, CADENCE_DAYS, computeSignals, determineTier, monthOf } from "../src/lib/engine";

const AS_OF = process.env.DEMO_AS_OF ?? "2026-10-24";

// ---------- PRNG ----------
let seed = 20261024;
function rnd(): number {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
}
const ri = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)];
const chance = (p: number) => rnd() < p;
let idn = 0;
const id = (p: string) => `${p}_${(++idn).toString(36).padStart(4, "0")}`;

// ---------- Geography ----------
const localities: Locality[] = [
  { fips: "51590", name: "Danville City", region: "southside", appendixA: true, pilotPhase: 1 },
  { fips: "51143", name: "Pittsylvania County", region: "southside", appendixA: true, pilotPhase: 1 },
  { fips: "51083", name: "Halifax County", region: "southside", appendixA: true, pilotPhase: 1 },
  { fips: "51089", name: "Henry County", region: "southside", appendixA: true, pilotPhase: 2 },
  { fips: "51690", name: "Martinsville City", region: "southside", appendixA: true, pilotPhase: 2 },
  { fips: "51117", name: "Mecklenburg County", region: "southside", appendixA: true, pilotPhase: 3 },
  { fips: "51001", name: "Accomack County", region: "eastern_shore", appendixA: true, pilotPhase: 0 },
  { fips: "51131", name: "Northampton County", region: "eastern_shore", appendixA: true, pilotPhase: 0 },
  { fips: "51147", name: "Prince Edward County", region: "southern_piedmont", appendixA: true, pilotPhase: 0 },
  { fips: "51029", name: "Buckingham County", region: "southern_piedmont", appendixA: true, pilotPhase: 0 },
  { fips: "51049", name: "Cumberland County", region: "southern_piedmont", appendixA: true, pilotPhase: 0 },
];

const ORG = "Dan River Community Health";
const sites: ClinicSite[] = [
  { id: "site_danville", name: "Dan River Community Health, Main Street", orgName: ORG, type: "FQHC", localityFips: "51590", town: "Danville", phone: "434-555-0140", ehrVendor: "unknown (confirm with partner)" },
  { id: "site_chatham", name: "Dan River Community Health, Chatham", orgName: ORG, type: "FQHC", localityFips: "51143", town: "Chatham", phone: "434-555-0141" },
  { id: "site_southboston", name: "Dan River Community Health, South Boston", orgName: ORG, type: "FQHC", localityFips: "51083", town: "South Boston", phone: "434-555-0142" },
  { id: "site_martinsville", name: "Dan River Community Health, Martinsville", orgName: ORG, type: "FQHC", localityFips: "51690", town: "Martinsville", phone: "276-555-0143" },
  { id: "site_boydton", name: "Dan River Community Health, Boydton", orgName: ORG, type: "FQHC", localityFips: "51117", town: "Boydton", phone: "434-555-0144" },
];
const siteForLocality: Record<string, string> = { "51590": "site_danville", "51143": "site_chatham", "51083": "site_southboston", "51089": "site_martinsville", "51690": "site_martinsville", "51117": "site_boydton" };

const staff: StaffUser[] = [
  { id: "st_pannell", name: "Dr. Carla Pannell", role: "physician", siteId: "site_danville", credentials: "MD, Chief Medical Officer" },
  { id: "st_whitlow", name: "Jamal Whitlow", role: "np_pa", siteId: "site_chatham", credentials: "FNP-C" },
  { id: "st_greer", name: "Tasha Greer", role: "rn", siteId: "site_danville", credentials: "RN, care coordinator" },
  { id: "st_delgado", name: "Rosa Delgado", role: "coordinator", siteId: "site_danville", credentials: "Rural enrollment coordinator" },
  { id: "st_price", name: "Hannah Price", role: "ot", siteId: "site_danville", credentials: "OTR/L, caregiver training" },
  { id: "st_bell", name: "Marcus Bell", role: "behavioral_health", siteId: "site_danville", credentials: "LCSW" },
  { id: "st_oakes", name: "Priya Oakes", role: "ma", siteId: "site_southboston", credentials: "CMA" },
];

// ---------- Names (invented) ----------
const FEMALE = ["Mabel", "Lorraine", "Bettie", "Odessa", "Geneva", "Pearl", "Wilma", "Thelma", "Inez", "Hazel", "Alberta", "Ruby", "Frances", "Vera", "Lucille", "Nannie", "Clara", "Ethel", "Marjorie", "Doris"];
const MALE = ["Earl", "Odell", "Harold", "Clarence", "Willie", "Roosevelt", "Otis", "Vernon", "Cecil", "Lester", "Herbert", "Raymond", "Curtis", "Elmer", "Wallace", "Leroy", "Alvin", "Floyd"];
const SURNAMES = ["Hairston", "Tuck", "Simms", "Motley", "Adkins", "Womack", "Barksdale", "Giles", "Hodnett", "Pruett", "Dalton", "Shelton", "Yeatts", "Stowe", "Crews", "Wimbish", "Boswell", "Lipscomb", "Overby", "Toombs", "Lovelace", "Keatts", "Scearce", "Farthing", "Tune"];
const CG_FEMALE = ["Denise", "Tamika", "Sharon", "Brenda", "Kimberly", "Angela", "Monique", "Patricia", "Crystal", "Melissa", "Latoya", "Gail", "Yolanda", "Renee", "Stacey"];
const CG_MALE = ["Terrence", "Darnell", "Kevin", "Ronnie", "Marcus", "Dwayne", "Gary", "Travis", "Calvin"];

// ---------- Clinical pools ----------
const DX = [
  { code: "G30.1", display: "Alzheimer's disease with late onset" },
  { code: "G30.9", display: "Alzheimer's disease, unspecified" },
  { code: "F01.50", display: "Vascular dementia, unspecified severity, without behavioral disturbance" },
  { code: "G31.83", display: "Dementia with Lewy bodies" },
  { code: "F03.90", display: "Unspecified dementia without behavioral disturbance" },
  { code: "F02.81", display: "Dementia in other diseases classified elsewhere with behavioral disturbance" },
];
const COMORBID = [
  { code: "I10", display: "Essential hypertension" },
  { code: "E11.9", display: "Type 2 diabetes mellitus without complications" },
  { code: "I50.9", display: "Heart failure, unspecified" },
  { code: "J44.9", display: "COPD, unspecified" },
  { code: "F32.A", display: "Depression, unspecified" },
  { code: "N18.30", display: "Chronic kidney disease, stage 3 unspecified" },
  { code: "E78.5", display: "Hyperlipidemia, unspecified" },
];
type MedT = { name: string; strength: string; sig: string; ndc: string; cls: "dementia" | "bp" | "dm" | "hf" | "lipid" | "mood" | "sleep" | "psych" | "pain" };
const MEDS: MedT[] = [
  { name: "donepezil", strength: "10 mg", sig: "1 tablet at bedtime", ndc: "00093741501", cls: "dementia" },
  { name: "memantine", strength: "10 mg", sig: "1 tablet twice daily", ndc: "00456320563", cls: "dementia" },
  { name: "rivastigmine", strength: "9.5 mg/24h patch", sig: "apply one patch daily", ndc: "00078050161", cls: "dementia" },
  { name: "lisinopril", strength: "20 mg", sig: "1 tablet daily", ndc: "68180051301", cls: "bp" },
  { name: "amlodipine", strength: "5 mg", sig: "1 tablet daily", ndc: "59762152001", cls: "bp" },
  { name: "metoprolol succinate", strength: "50 mg", sig: "1 tablet daily", ndc: "00378358001", cls: "bp" },
  { name: "hydrochlorothiazide", strength: "25 mg", sig: "1 tablet every morning", ndc: "00172208360", cls: "bp" },
  { name: "metformin", strength: "500 mg", sig: "1 tablet twice daily with meals", ndc: "00093104801", cls: "dm" },
  { name: "glipizide", strength: "5 mg", sig: "1 tablet before breakfast", ndc: "00093083401", cls: "dm" },
  { name: "furosemide", strength: "20 mg", sig: "1 tablet every morning", ndc: "00054429725", cls: "hf" },
  { name: "atorvastatin", strength: "20 mg", sig: "1 tablet at bedtime", ndc: "00378395277", cls: "lipid" },
  { name: "sertraline", strength: "50 mg", sig: "1 tablet daily", ndc: "68180035101", cls: "mood" },
  { name: "trazodone", strength: "50 mg", sig: "1/2 to 1 tablet at bedtime as needed", ndc: "00093100001", cls: "sleep" },
  { name: "melatonin", strength: "3 mg", sig: "1 tablet at bedtime", ndc: "", cls: "sleep" },
  { name: "quetiapine", strength: "25 mg", sig: "1 tablet at bedtime", ndc: "60505313001", cls: "psych" },
  { name: "lorazepam", strength: "0.5 mg", sig: "as needed for agitation", ndc: "00591024101", cls: "psych" },
  { name: "acetaminophen", strength: "500 mg", sig: "2 tablets every 8 hours as needed", ndc: "", cls: "pain" },
  { name: "diphenhydramine", strength: "25 mg", sig: "at bedtime for sleep", ndc: "", cls: "sleep" },
];

const RESOURCES_SPEC: { name: string; category: CommunityResource["category"]; fips: string[]; summary: string }[] = [
  { name: "Southside Area Agency on Aging — Alzheimer's respite program", category: "respite", fips: ["51590", "51143", "51089", "51690"], summary: "Up to 10 hours a week of in-home respite for caregivers of people with dementia; sliding scale, waitlist varies by county." },
  { name: "Halifax Senior Services respite vouchers", category: "respite", fips: ["51083"], summary: "Quarterly respite vouchers redeemable with approved in-home aides." },
  { name: "Dan River Adult Day Center", category: "adult_day", fips: ["51590", "51143"], summary: "Weekday adult day program with memory-care track; transport within 15 miles of Danville." },
  { name: "South Boston Adult Day Health", category: "adult_day", fips: ["51083"], summary: "Adult day health with nursing on site, Monday to Friday." },
  { name: "Pittsylvania Rides (demand-response transit)", category: "transport", fips: ["51143", "51590"], summary: "Door-to-door rides for medical appointments; book 48 hours ahead." },
  { name: "Halifax County Medical Transport", category: "transport", fips: ["51083"], summary: "Medicaid non-emergency medical transportation broker and volunteer drivers." },
  { name: "Henry–Martinsville Ride Connect", category: "transport", fips: ["51089", "51690"], summary: "Volunteer driver program for older adults; medical appointments prioritized." },
  { name: "Meals on Wheels of Southside Virginia", category: "meals", fips: ["51590", "51143", "51083", "51089", "51690", "51117"], summary: "Weekday home-delivered meals; dementia-friendly check-in at the door." },
  { name: "Memory Café at Danville Public Library", category: "memory_cafe", fips: ["51590", "51143"], summary: "Second Tuesday monthly; a social hour for people living with dementia and their care partners." },
  { name: "Caregiver Circle — Chatham", category: "caregiver_support", fips: ["51143"], summary: "Peer support group for family caregivers, evenings, with respite care on site." },
  { name: "Halifax Caregiver Support Group", category: "caregiver_support", fips: ["51083"], summary: "Monthly support group facilitated by a licensed counselor." },
  { name: "Southside Legal Aid — advance directives clinic", category: "legal_financial", fips: ["51590", "51143", "51083", "51089", "51690", "51117"], summary: "Free help with powers of attorney, advance medical directives and Medicaid long-term-care applications." },
  { name: "Piedmont Home Care Partners", category: "home_care", fips: ["51590", "51143", "51089", "51690"], summary: "Licensed personal-care aides; Medicaid waiver and private pay." },
  { name: "Dan River Behavioral Health — caregiver counseling", category: "behavioral_health", fips: ["51590", "51143", "51083", "51690", "51117"], summary: "Short-term counseling for caregivers; telehealth available." },
  { name: "Mecklenburg Senior Center adult day", category: "adult_day", fips: ["51117"], summary: "Adult day program three days a week in Boydton." },
  { name: "Lake Country Rides", category: "transport", fips: ["51117"], summary: "Scheduled medical transport across Mecklenburg County." },
];

const resources: CommunityResource[] = RESOURCES_SPEC.map((r, i) => ({
  id: `res_${(i + 1).toString().padStart(2, "0")}`,
  name: r.name,
  category: r.category,
  localityFips: r.fips,
  phone: `${r.fips[0].startsWith("5169") || r.fips[0] === "51089" ? "276" : "434"}-555-01${(10 + i).toString().padStart(2, "0")}`,
  summary: r.summary,
  directory: { source: "virginianavigator_mock", listingId: `VN-${(48210 + i * 37).toString()}`, url: `https://virginianavigator.org/listing/${48210 + i * 37}` },
}));

// ---------- Builders ----------
function mbi(): string {
  const A = [..."ACDEFGHJKMNPQRTUVWXY"];
  const AN = [...A, ..."0123456789"];
  return `${ri(1, 9)}${pick(A)}${pick(AN)}${ri(0, 9)}${pick(A)}${pick(AN)}${ri(0, 9)}${pick(A)}${pick(A)}${ri(0, 9)}${ri(0, 9)}`;
}

function zbiItems(total: number): number[] {
  const items = new Array(12).fill(0);
  let t = total;
  while (t > 0) {
    const i = ri(0, 11);
    if (items[i] < 4) {
      items[i] += 1;
      t -= 1;
    }
  }
  return items;
}

interface Spec {
  pfirst: string;
  plast: string;
  sex: "F" | "M";
  age: number;
  fips: string;
  status: Household["status"];
  cdr?: 0.5 | 1 | 2 | 3;
  fast?: Household["staging"] extends infer S ? (S extends { fast?: infer F } ? F : never) : never;
  caregiver?: { first: string; rel: CaregiverRelationship; age: number; lives: boolean; smartphone: boolean; broadband: "ok" | "low" | "none"; identity: Caregiver["identity"]["status"]; provider?: "idme" | "clear" | "in_person"; proxy: Caregiver["proxy"]["status"]; zbi: number[]; phq?: [number, number][]; bpHigh?: "crisis" | "elevated" | "none"; ownVisitDaysAgo?: number };
  secondCaregiver?: { first: string; rel: CaregiverRelationship; age: number };
  medicare: boolean;
  enrolledDaysAgo: number;
  scenario?: "A" | "B" | "C" | "D" | "E" | "F";
  referral?: Household["referralSource"];
  edVisitDaysAgo?: number;
}

const worked: Spec[] = [
  { pfirst: "Mabel", plast: "Hairston", sex: "F", age: 85, fips: "51590", status: "active", cdr: 2, fast: "6a", caregiver: { first: "Denise", rel: "daughter", age: 62, lives: true, smartphone: true, broadband: "ok", identity: "verified", provider: "idme", proxy: "confirmed", zbi: [9, 12, 15], phq: [[1, 0], [1, 1]], bpHigh: "elevated", ownVisitDaysAgo: 420 }, medicare: true, enrolledDaysAgo: 84, scenario: "A", referral: "clinic" },
  { pfirst: "Earl", plast: "Tuck", sex: "M", age: 81, fips: "51143", status: "active", cdr: 2, fast: "6c", caregiver: { first: "Lorraine", rel: "spouse", age: 78, lives: true, smartphone: false, broadband: "none", identity: "verified", provider: "in_person", proxy: "confirmed", zbi: [19, 24], phq: [[2, 2]], bpHigh: "none", ownVisitDaysAgo: 200 }, medicare: true, enrolledDaysAgo: 70, scenario: "B", referral: "aaa" },
  { pfirst: "Odell", plast: "Simms", sex: "M", age: 88, fips: "51083", status: "active", cdr: 1, fast: "4", caregiver: { first: "Terrence", rel: "son", age: 55, lives: false, smartphone: true, broadband: "ok", identity: "verified", provider: "clear", proxy: "requested", zbi: [7], ownVisitDaysAgo: 90 }, secondCaregiver: { first: "Pearl", rel: "friend_neighbor", age: 71 }, medicare: false, enrolledDaysAgo: 12, scenario: "C", referral: "directory" },
  { pfirst: "Bettie", plast: "Womack", sex: "F", age: 79, fips: "51089", status: "active", cdr: 1, fast: "4", medicare: true, enrolledDaysAgo: 40, scenario: "D", referral: "aaa" },
  { pfirst: "Harold", plast: "Motley", sex: "M", age: 83, fips: "51590", status: "enrolling", cdr: 2, fast: "5", caregiver: { first: "Tamika", rel: "daughter_in_law", age: 47, lives: true, smartphone: true, broadband: "low", identity: "in_person_pending", proxy: "not_requested", zbi: [] }, medicare: false, enrolledDaysAgo: 6, scenario: "E", referral: "hospital_discharge", edVisitDaysAgo: 9 },
  { pfirst: "Clarence", plast: "Adkins", sex: "M", age: 90, fips: "51117", status: "active", cdr: 3, fast: "7a", caregiver: { first: "Geneva", rel: "spouse", age: 86, lives: true, smartphone: false, broadband: "low", identity: "verified", provider: "idme", proxy: "confirmed", zbi: [14, 16, 21], phq: [[1, 1], [2, 1]], bpHigh: "crisis", ownVisitDaysAgo: 500 }, medicare: true, enrolledDaysAgo: 95, scenario: "F", referral: "clinic", edVisitDaysAgo: 14 },
];

function randomSpec(fips: string, i: number): Spec {
  const sex = chance(0.62) ? "F" : "M";
  const stageRoll = rnd();
  const cdr = stageRoll < 0.35 ? 1 : stageRoll < 0.8 ? 2 : 3;
  const fast = cdr === 1 ? "4" : cdr === 2 ? pick(["5", "6a", "6b"] as const) : pick(["6c", "6d", "6e", "7a"] as const);
  const hasCg = chance(0.85);
  const rel = pick<CaregiverRelationship>(["spouse", "daughter", "daughter", "son", "daughter_in_law", "sibling", "grandchild"]);
  const cgAge = rel === "spouse" ? ri(70, 86) : rel === "grandchild" ? ri(28, 40) : ri(45, 66);
  const smartphone = chance(0.78);
  const broadband = pick(["ok", "ok", "low", "low", "none"] as const);
  const idRoll = rnd();
  const identity: Caregiver["identity"]["status"] = idRoll < 0.7 ? "verified" : idRoll < 0.8 ? "pending" : idRoll < 0.88 ? "failed" : idRoll < 0.94 ? "in_person_pending" : "not_started";
  const provider = identity === "verified" ? pick(["idme", "clear", "clear", "in_person"] as const) : undefined;
  const proxy: Caregiver["proxy"]["status"] = identity !== "verified" ? (chance(0.5) ? "requested" : "not_requested") : chance(0.85) ? "confirmed" : "requested";
  const base = cdr === 1 ? ri(3, 12) : ri(6, 19);
  const n = ri(1, 3);
  const zbi = Array.from({ length: n }, (_, k) => Math.max(0, Math.min(48, base + ri(-3, 4) * k)));
  const status: Household["status"] = i % 11 === 0 ? "enrolling" : i % 17 === 0 ? "invited" : "active";
  return {
    pfirst: sex === "F" ? pick(FEMALE) : pick(MALE),
    plast: pick(SURNAMES),
    sex,
    age: ri(72, 93),
    fips,
    status,
    cdr,
    fast,
    caregiver: hasCg
      ? {
          first: rel === "son" || rel === "grandchild" ? pick([...CG_MALE, ...CG_FEMALE]) : pick(CG_FEMALE),
          rel,
          age: cgAge,
          lives: rel === "spouse" ? true : chance(0.6),
          smartphone,
          broadband,
          identity,
          provider,
          proxy,
          zbi,
          phq: chance(0.6) ? [[ri(0, 2), ri(0, 2)] as [number, number]] : undefined,
          bpHigh: chance(0.15) ? "elevated" : "none",
          ownVisitDaysAgo: chance(0.7) ? ri(30, 700) : undefined,
        }
      : undefined,
    medicare: chance(0.6),
    enrolledDaysAgo: status === "invited" ? ri(1, 10) : ri(10, 110),
    referral: pick(["clinic", "clinic", "clinic", "directory", "aaa", "hospital_discharge", "self"] as const),
    edVisitDaysAgo: chance(0.1) ? ri(5, 150) : undefined,
  };
}

function buildHousehold(s: Spec): Household {
  const hid = id("hh");
  const pid = id("pt");
  const enrolledOn = addDays(AS_OF, -s.enrolledDaysAgo);
  const birthYear = +AS_OF.slice(0, 4) - s.age;
  const site = siteForLocality[s.fips];
  const dual = chance(0.45);
  const dx = s.fast && parseInt(s.fast, 10) >= 6 && chance(0.2) ? DX[3] : pick(DX);
  const comorbid = [...COMORBID].sort(() => rnd() - 0.5).slice(0, ri(1, 3));

  // Medications: clinic list + Medicare fills with scenario-driven discrepancies
  const clinicMeds: Medication[] = [];
  const fills: Household["medicareFills"] = [];
  const addMed = (m: MedT, source: Medication["source"] = "clinic", status: Medication["status"] = "active") =>
    clinicMeds.push({ id: id("med"), name: m.name, strength: m.strength, sig: m.sig, source, status, prescriber: source === "clinic" ? pick(["Dr. Pannell", "J. Whitlow, FNP"]) : undefined });
  const addFill = (m: MedT, daysAgo: number, supply = 30) => m.ndc && fills.push({ ndc: m.ndc, name: m.name, strength: m.strength, fillOn: addDays(AS_OF, -daysAgo), daysSupply: supply });
  const dem = pick(MEDS.filter((m) => m.cls === "dementia"));
  addMed(dem);
  addFill(dem, ri(2, 28));
  for (const c of comorbid) {
    const cls = c.code === "I10" ? "bp" : c.code.startsWith("E11") ? "dm" : c.code.startsWith("I50") ? "hf" : c.code.startsWith("E78") ? "lipid" : c.code.startsWith("F32") ? "mood" : null;
    if (!cls) continue;
    const m = pick(MEDS.filter((x) => x.cls === cls));
    addMed(m);
    addFill(m, ri(2, 28));
  }
  if (s.scenario === "A") {
    const q = MEDS.find((m) => m.name === "quetiapine")!;
    addFill(q, 18); // filled by another prescriber, not on list
    const lis = MEDS.find((m) => m.name === "lisinopril")!;
    if (!clinicMeds.some((m) => m.name === "lisinopril")) addMed(lis);
    fills.splice(0, fills.length, ...fills.filter((f) => f.name !== "lisinopril"));
    addFill(lis, 140); // listed, not filled in months
  } else if (s.scenario === "B") {
    addMed(MEDS.find((m) => m.name === "diphenhydramine")!, "caregiver", "active");
  } else if (s.scenario === "F") {
    addMed(MEDS.find((m) => m.name === "lorazepam")!);
    addFill(MEDS.find((m) => m.name === "lorazepam")!, 10);
  } else if (chance(0.25)) {
    const extra = pick(MEDS.filter((m) => m.ndc && !clinicMeds.some((c) => c.name === m.name)));
    addFill(extra, ri(5, 60));
  }

  // Caregivers
  const caregivers: Caregiver[] = [];
  const mkCaregiver = (c: NonNullable<Spec["caregiver"]>, primary: boolean): Caregiver => {
    const cgId = id("cg");
    const zbiDates = c.zbi.map((_, k) => addDays(enrolledOn, k === 0 ? 0 : Math.round((s.enrolledDaysAgo - 3) * (k / Math.max(1, c.zbi.length - 1)))));
    const bp: Caregiver["health"]["bp"] = [];
    if (c.bpHigh === "crisis") bp.push({ date: addDays(AS_OF, -1), systolic: 186, diastolic: 104, source: "home_cuff" }, { date: addDays(AS_OF, -8), systolic: 162, diastolic: 96, source: "home_cuff" });
    else if (c.bpHigh === "elevated") bp.push({ date: addDays(AS_OF, -3), systolic: 151, diastolic: 91, source: "home_cuff" }, { date: addDays(AS_OF, -12), systolic: 147, diastolic: 89, source: "home_cuff" }, { date: addDays(AS_OF, -24), systolic: 138, diastolic: 84, source: "home_cuff" });
    else if (chance(0.5)) bp.push({ date: addDays(AS_OF, -ri(1, 20)), systolic: ri(112, 136), diastolic: ri(70, 86), source: "home_cuff" });
    const verifiedOn = c.identity === "verified" ? addDays(enrolledOn, ri(0, 4)) : undefined;
    return {
      id: cgId,
      givenName: c.first,
      familyName: c.rel === "spouse" || c.rel === "daughter" || c.rel === "son" ? s.plast : pick(SURNAMES),
      birthDate: `${+AS_OF.slice(0, 4) - c.age}-${String(ri(1, 12)).padStart(2, "0")}-${String(ri(1, 28)).padStart(2, "0")}`,
      relationship: c.rel,
      livesWithPatient: c.lives,
      localityFips: c.lives ? s.fips : pick(localities.filter((l) => l.pilotPhase > 0)).fips,
      phone: `${s.fips === "51089" || s.fips === "51690" ? "276" : "434"}-555-0${ri(200, 999)}`,
      access: { smartphone: c.smartphone, broadband: c.broadband, preferredChannel: !c.smartphone ? (chance(0.5) ? "sms" : "phone") : c.broadband === "none" ? "sms" : "app" },
      isPrimary: primary,
      identity: {
        status: c.identity,
        provider: c.provider,
        assurance: c.identity === "verified" ? "IAL2" : undefined,
        authenticator: c.identity === "verified" ? "AAL2" : undefined,
        verifiedOn,
        subject: c.identity === "verified" ? `${c.provider}|${c.provider === "in_person" ? "clinic" : "sub"}|${cgId}` : undefined,
        failureReason: c.identity === "failed" ? "Document image could not be read at the vendor." : c.identity === "in_person_pending" ? "Remote proofing failed twice; in-person session scheduled with the enrollment coordinator." : undefined,
        attempts: c.identity === "not_started" ? 0 : c.identity === "failed" || c.identity === "in_person_pending" ? 2 : 1,
      },
      proxy: {
        status: c.proxy,
        consentRecordedOn: c.proxy === "confirmed" ? addDays(verifiedOn ?? enrolledOn, 1) : undefined,
        consentBasis: c.proxy === "confirmed" ? (s.cdr && s.cdr >= 2 ? "poa_healthcare" : "patient") : undefined,
        requestedOn: c.proxy !== "not_requested" ? addDays(verifiedOn ?? enrolledOn, 0) : undefined,
        confirmedOn: c.proxy === "confirmed" ? addDays(verifiedOn ?? enrolledOn, 1) : undefined,
        confirmedBy: c.proxy === "confirmed" ? pick(["st_greer", "st_delgado", "st_whitlow"]) : undefined,
        scope: c.proxy === "confirmed" ? ["care_plan", "medications", "appointments", "messages", "medicare_records", "symptom_log"] : [],
      },
      health: {
        phq2: (c.phq ?? []).map((items, k) => ({ date: addDays(AS_OF, -(c.phq!.length - k) * 21 + ri(0, 6)), items, total: items[0] + items[1], routedOn: items[0] + items[1] >= 3 && s.scenario !== "B" && chance(0.5) ? addDays(AS_OF, -3) : undefined })),
        bp,
        zbi: c.zbi.map((t, k) => ({ date: zbiDates[k], items: zbiItems(t), total: t, context: k === 0 ? "baseline" : "check_in" })),
        ownPcpLastVisit: c.ownVisitDaysAgo !== undefined ? addDays(AS_OF, -c.ownVisitDaysAgo) : undefined,
        ownPcpNextScheduled: c.ownVisitDaysAgo !== undefined && c.ownVisitDaysAgo > 365 && chance(0.3) ? addDays(AS_OF, ri(5, 40)) : undefined,
        hasHomeBpCuff: c.bpHigh !== "none" || chance(0.5),
      },
      hoursPerWeek: c.lives ? ri(30, 80) : ri(6, 25),
    };
  };
  if (s.caregiver) caregivers.push(mkCaregiver(s.caregiver, true));
  if (s.secondCaregiver) caregivers.push(mkCaregiver({ first: s.secondCaregiver.first, rel: s.secondCaregiver.rel, age: s.secondCaregiver.age, lives: false, smartphone: true, broadband: "low", identity: "not_started", proxy: "not_requested", zbi: [] }, false));

  const staging = s.cdr ? { cdrGlobal: s.cdr, fast: s.fast as Household["staging"] extends infer S ? (S extends { fast?: infer F } ? F : never) : never, assessedOn: addDays(enrolledOn, ri(0, 5)), assessedBy: pick(["st_pannell", "st_whitlow"]), npiqSeverity: s.scenario === "F" ? 19 : ri(2, 14) } : undefined;
  const primary = caregivers.find((c) => c.isPrimary);
  const latestZbi = primary?.health.zbi.at(-1)?.total;
  const tier = determineTier(staging, !!primary, latestZbi).tier;

  // Contacts respecting cadence (mostly)
  const contacts: ContactEvent[] = [];
  if (s.status !== "invited") {
    const cadence = tier ? CADENCE_DAYS[tier] : 30;
    const slip = s.scenario === "C" ? 0 : s.scenario === "B" ? 1.9 : chance(0.25) ? 1.8 : 1.05;
    for (let d = addDays(enrolledOn, 2); d <= AS_OF; d = addDays(d, Math.max(5, Math.round(cadence * slip)))) {
      const kind = pick(["phone", "phone", "video", "secure_message", "in_person", "caregiver_group"] as const);
      contacts.push({
        id: id("ct"),
        date: d,
        kind,
        byStaffId: kind === "caregiver_group" ? "st_price" : pick(["st_greer", "st_greer", "st_whitlow", "st_delgado"]),
        minutes: kind === "in_person" ? ri(25, 45) : kind === "caregiver_group" ? 60 : ri(8, 25),
        summary: pick(["Reviewed symptom log and medications with caregiver.", "Check-in call; no new concerns.", "Discussed sleep and evening agitation; reinforced routine.", "Confirmed transport for upcoming visit.", "Caregiver skills group: bathing and redirection.", "Reviewed plan after symptom entries; adjusted watch list."]),
        supports: kind === "caregiver_group" ? ["caregiver_training"] : ["care_management"],
      });
    }
    if (s.scenario === "B") contacts.splice(-1, 1); // overdue on purpose
  }

  // Symptom log
  const symptoms: SymptomEntry[] = [];
  if (primary && primary.proxy.status === "confirmed") {
    const n = ri(2, 9);
    for (let k = 0; k < n; k++) {
      const kind = pick(["confusion", "behavior", "sleep", "appetite", "pain", "mood", "other", "wandering"] as const);
      symptoms.push({ id: id("sy"), date: addDays(AS_OF, -ri(1, Math.min(60, s.enrolledDaysAgo))), kind, severity: pick([1, 1, 2, 2, 3] as const), note: pick(["Up several times in the night.", "Would not eat lunch.", "Asked for her mother repeatedly.", "Agitated after sundown, settled by 9.", "Knee pain, limping.", "Quiet and tearful most of the day.", "Tried to leave the house to 'go to work'.", "Did not recognize the neighbor."]), reportedBy: primary.id });
    }
    if (s.scenario === "B") {
      symptoms.push({ id: id("sy"), date: addDays(AS_OF, -2), kind: "fall", severity: 2, note: "Slipped getting out of the tub; bruised hip, did not hit head.", reportedBy: primary.id });
      symptoms.push({ id: id("sy"), date: addDays(AS_OF, -1), kind: "urinary", severity: 1, note: "Wet twice today, unusual for him.", reportedBy: primary.id });
      symptoms.push({ id: id("sy"), date: addDays(AS_OF, -1), kind: "confusion", severity: 3, note: "Did not know me this morning, very different from last week.", reportedBy: primary.id });
    }
    if (s.scenario === "F") symptoms.push({ id: id("sy"), date: addDays(AS_OF, -3), kind: "behavior", severity: 3, note: "Struck out at me during changing; frightened both of us.", reportedBy: primary.id });
    if (s.scenario === "A") symptoms.push({ id: id("sy"), date: addDays(AS_OF, -5), kind: "sleep", severity: 2, note: "Awake 2 to 4 am three nights running.", reportedBy: primary.id });
  }

  // Appointments
  const appts: Appointment[] = [];
  const lastAwv = s.status === "invited" ? undefined : chance(0.55) ? addDays(AS_OF, -ri(20, 340)) : chance(0.5) ? addDays(AS_OF, -ri(370, 700)) : undefined;
  const lastCog = s.status === "invited" ? undefined : chance(0.45) ? addDays(AS_OF, -ri(10, 300)) : undefined;
  if (s.scenario === "A") appts.push({ id: id("ap"), date: addDays(AS_OF, 4), time: "10:20 AM", purpose: "annual_wellness", withName: "Dr. Carla Pannell", location: "Dan River Community Health, Main Street", status: "scheduled", transport: { needed: true, arranged: false }, forPerson: "patient" });
  if (s.scenario === "B") appts.push({ id: id("ap"), date: addDays(AS_OF, -9), purpose: "follow_up", withName: "Jamal Whitlow, FNP", location: "Chatham", status: "missed", transport: { needed: true, arranged: false }, forPerson: "patient" });
  if (s.scenario === "C") appts.push({ id: id("ap"), date: addDays(AS_OF, 11), time: "2:00 PM", purpose: "cognitive_assessment", withName: "Dr. Carla Pannell", location: "South Boston", status: "scheduled", transport: { needed: false, arranged: false }, forPerson: "patient" });
  if (chance(0.5) && s.status === "active") appts.push({ id: id("ap"), date: addDays(AS_OF, ri(3, 45)), time: pick(["9:00 AM", "11:30 AM", "1:40 PM", "3:15 PM"]), purpose: pick(["follow_up", "lab", "annual_wellness", "specialist"] as const), withName: pick(["Dr. Carla Pannell", "Jamal Whitlow, FNP", "Neurology, Lynchburg"]), location: pick(["Main Street", "Chatham", "South Boston", "Lynchburg (85 miles)"]), status: "scheduled", transport: { needed: chance(0.5), arranged: chance(0.6) }, forPerson: "patient" });
  if (primary?.health.ownPcpNextScheduled) appts.push({ id: id("ap"), date: primary.health.ownPcpNextScheduled, purpose: "caregiver_own_visit", withName: "Her own provider", location: "—", status: "scheduled", transport: { needed: false, arranged: false }, forPerson: "caregiver" });

  // Messages
  const messages: Message[] = [];
  if (primary && primary.proxy.status === "confirmed" && s.status === "active") {
    const n = ri(1, 4);
    for (let k = 0; k < n; k++) {
      const d = addDays(AS_OF, -ri(1, 30));
      messages.push({ id: id("msg"), at: `${d}T${String(ri(7, 20)).padStart(2, "0")}:${String(ri(0, 59)).padStart(2, "0")}:00`, from: "caregiver", authorId: primary.id, authorName: primary.givenName, body: pick(["Is it okay to give the trazodone a little earlier? She is wound up by 7.", "The pharmacy says the memantine needs a new prescription.", "Can someone call me about the day program? I need Thursdays.", "He ate better this week. Thank you for the tip about smaller plates."]) });
      messages.push({ id: id("msg"), at: `${d}T${String(ri(8, 17)).padStart(2, "0")}:${String(ri(0, 59)).padStart(2, "0")}:00`, from: "clinic", authorId: "st_greer", authorName: "Tasha Greer, RN", body: pick(["Yes, 6 pm is fine; let us know how the next three nights go.", "Sent the refill to the pharmacy this morning.", "I'll call you tomorrow before noon.", "That's good news. Keep logging it."]), readAt: `${d}T18:00:00` });
    }
  }
  if (s.scenario === "A") messages.push({ id: id("msg"), at: `${addDays(AS_OF, -1)}T19:42:00`, from: "caregiver", authorId: primary!.id, authorName: primary!.givenName, body: "Dr. Pannell's office said Mom's appointment is Wednesday but I don't have a way to get her there. Can you help with a ride?" });

  // Referrals
  const referrals: Referral[] = [];
  const local = resources.filter((r) => r.localityFips.includes(s.fips));
  if (primary && s.status === "active") {
    const n = ri(0, 3);
    for (let k = 0; k < n; k++) {
      const r = pick(local);
      const st = pick(["suggested", "contacted", "enrolled", "declined", "not_reached", "closed"] as const);
      const d = addDays(AS_OF, -ri(3, 60));
      referrals.push({ id: id("ref"), resourceId: r.id, suggestedOn: d, suggestedBy: pick(["clinic", "caregiver", "directory"] as const), status: st, updatedOn: addDays(d, ri(0, 14)), outcomeNote: st === "enrolled" ? "Started services." : st === "declined" ? "Not a fit right now." : st === "not_reached" ? "Left two voicemails." : undefined, reportedBackOn: st === "enrolled" || st === "declined" ? addDays(d, ri(1, 20)) : undefined });
    }
  }
  if (s.scenario === "B") referrals.push({ id: id("ref"), resourceId: "res_01", suggestedOn: addDays(AS_OF, -20), suggestedBy: "clinic", status: "contacted", updatedOn: addDays(AS_OF, -15), outcomeNote: "On the respite waitlist; intake call done." });

  const edVisits: Household["edVisits"] = s.edVisitDaysAgo ? [{ date: addDays(AS_OF, -s.edVisitDaysAgo), reason: pick(["Fall with hip pain", "Altered mental status", "Shortness of breath", "Urinary tract infection"]), source: "partner_reported", admitted: chance(0.4) }] : [];

  const h: Household = {
    id: hid,
    siteId: site,
    patient: {
      id: pid,
      givenName: s.pfirst,
      familyName: s.plast,
      birthDate: `${birthYear}-${String(ri(1, 12)).padStart(2, "0")}-${String(ri(1, 28)).padStart(2, "0")}`,
      sex: s.sex,
      mbi: mbi(),
      coverage: { partA: true, partB: true, partC: false, partD: true, medicaid: dual },
      residence: primary?.livesWithPatient ? (primary.relationship === "spouse" ? "own_home" : "family_home") : "own_home",
      localityFips: s.fips,
      diagnoses: [dx, ...comorbid],
      ehrPatientId: s.status === "active" && chance(0.7) ? `ehr-${s.plast.toLowerCase()}-${birthYear}` : undefined,
    },
    caregivers,
    status: s.status,
    enrolledOn: s.status === "invited" ? undefined : enrolledOn,
    referralSource: s.referral ?? "clinic",
    staging,
    carePlan: {
      tier,
      tierSetOn: staging?.assessedOn,
      contactCadenceDays: tier ? CADENCE_DAYS[tier] : 30,
      goals: tier
        ? [
            { id: id("g"), text: "Keep one shared medication list; reconcile after every pharmacy change.", owner: "shared", status: "active" },
            { id: id("g"), text: primary ? `Arrange regular respite so ${primary.givenName} gets at least four hours a week off.` : "Daily check-in call arranged through the Area Agency on Aging.", owner: "clinic", status: chance(0.5) ? "active" : "met" },
            { id: id("g"), text: "Evening routine: lights, supper by 6, no screens after 8.", owner: "caregiver", status: "active" },
            { id: id("g"), text: "Annual wellness and cognitive assessment visits completed this year.", owner: "clinic", status: lastAwv && lastCog ? "met" : "active", dueOn: addDays(AS_OF, 60) },
          ]
        : [],
      watchFor: ["Sudden change in confusion (worse over a day or two): call us the same day", "Fall, even without injury", "Not drinking, or new trouble urinating", "Striking out, frightening behavior, or trying to leave the house"],
      whoToCall: [
        { label: `${ORG} (daytime)`, phone: sites.find((x) => x.id === site)!.phone },
        { label: "After-hours nurse line", phone: "434-555-0199" },
        { label: "Emergency", phone: "911" },
      ],
      respiteArrangement: s.scenario === "B" ? "Waitlisted for AAA respite; church volunteer Tuesdays 1–4." : chance(0.4) ? "Adult day program two days a week." : undefined,
      reviewedOn: s.status === "active" ? addDays(AS_OF, -ri(5, 120)) : undefined,
      reviewedBy: "st_greer",
    },
    medications: clinicMeds,
    medicareFills: s.medicare ? fills : [],
    medicare: s.medicare ? { connected: true, connectedOn: addDays(enrolledOn, ri(1, 10)), lastSyncOn: addDays(AS_OF, -ri(0, 25)), mode: "mock", authorizedBy: primary && (s.cdr ?? 0) >= 2 ? "representative" : "patient" } : { connected: false },
    medReconciliationCompletedOn: s.status === "active" && s.scenario !== "A" && chance(0.6) ? addDays(AS_OF, -ri(3, 80)) : undefined,
    symptomLog: symptoms,
    appointments: appts,
    messages,
    contacts,
    referrals,
    escalations: [],
    edVisits,
    summaries: [],
    lastCognitiveAssessmentOn: lastCog,
    lastAnnualWellnessOn: lastAwv,
  };

  // Escalations: materialize signals as open escalations, plus a few resolved older ones
  const sigs = computeSignals(h, AS_OF).filter((x) => x.severity !== "info");
  const esc: Escalation[] = sigs.map((x) => ({ ...x, id: id("esc"), raisedOn: x.evidenceDate ?? AS_OF, status: chance(0.3) ? "acknowledged" : "open", acknowledgedBy: undefined }));
  for (const e of esc) {
    if (e.status === "acknowledged") {
      e.acknowledgedBy = "st_greer";
      e.acknowledgedOn = AS_OF;
    }
  }
  if (s.status === "active" && chance(0.6)) {
    const d = addDays(AS_OF, -ri(20, 80));
    esc.push({ rule: "CADENCE_OVERDUE", severity: "warning", message: "Contact overdue by 6 days.", action: "Schedule a call.", owner: "clinic", key: `old:${d}`, id: id("esc"), raisedOn: d, status: "resolved", resolvedOn: addDays(d, ri(1, 5)), resolvedBy: "st_greer", resolution: "Called and logged." });
  }
  h.escalations = esc;

  // Monthly summaries for completed months since enrollment
  if (h.enrolledOn) {
    const months = new Set<string>();
    for (let d = h.enrolledOn; d < AS_OF; d = addDays(d, 28)) months.add(monthOf(d));
    months.delete(monthOf(AS_OF));
    h.summaries = [...months].sort().map((m) => buildMonthlySummary(h, m, `${m}-28`));
  }
  return h;
}

// ---------- Compose ----------
const plan: [string, number][] = [
  ["51590", 9],
  ["51143", 10],
  ["51083", 7],
  ["51089", 2],
  ["51690", 2],
  ["51117", 1],
];
const specs: Spec[] = [...worked];
let i = 1;
for (const [fips, n] of plan) for (let k = 0; k < n; k++) specs.push(randomSpec(fips, i++));

const households = specs.map(buildHousehold);
// Give the worked cases stable ids
const stable = ["hh_hairston", "hh_tuck", "hh_simms", "hh_womack", "hh_motley", "hh_adkins"];
stable.forEach((sid, k) => (households[k].id = sid));

const data: SeedData = { generatedOn: new Date().toISOString().slice(0, 10), asOf: AS_OF, localities, sites, staff, resources, households };

const out = path.join(import.meta.dirname, "..", "data", "seed");
mkdirSync(out, { recursive: true });
writeFileSync(path.join(out, "seed.json"), JSON.stringify(data, null, 1));
const active = households.filter((h) => h.status === "active").length;
const verified = households.flatMap((h) => h.caregivers).filter((c) => c.identity.status === "verified").length;
console.log(`Seed: ${households.length} households (${active} active), ${verified} verified caregivers, ${resources.length} listings → data/seed/seed.json (as of ${AS_OF})`);
