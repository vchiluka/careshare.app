/**
 * Synthetic Blue Button 2.0 resources, in the FHIR R4 shapes the sandbox returns, for the mock
 * adapter and the seed. Deterministic per beneficiary key. Everything is invented; NDCs and HCPCS
 * codes are real code-system values because the mapper and reconciliation match on them, but no
 * record corresponds to a person.
 */

type Res = Record<string, unknown>;

export interface SyntheticProfile {
  key: string; // seed for the PRNG, e.g. household id
  givenName: string;
  familyName: string;
  birthDate: string;
  gender: "male" | "female";
  state?: string;
  postalCode?: string;
  dual: boolean;
  /** Clinical sketch the claims should reflect. */
  dementiaCode: string; // ICD-10-CM
  comorbidities: string[]; // ICD-10-CM
  /** Generic drug names with NDC and strength to fill in Part D. */
  drugs: { ndc: string; name: string; strength: string; daysSupply?: number; lastFillDaysAgo?: number; fills?: number }[];
  asOf: string;
  /** Add an ED/outpatient claim this many days ago, if set. */
  edVisitDaysAgo?: number;
  edReasonCode?: string;
}

function prng(seedStr: string) {
  let h = 2166136261;
  for (const ch of seedStr) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return () => {
    h = (Math.imul(h, 1664525) + 1013904223) >>> 0;
    return h / 4294967296;
  };
}
function addDays(a: string, n: number): string {
  const d = new Date(Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10)));
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const BB = "https://bluebutton.cms.gov/resources";
const dx = (code: string, seq: number, principal = false): Res => ({
  sequence: seq,
  diagnosisCodeableConcept: { coding: [{ system: "http://hl7.org/fhir/sid/icd-10-cm", code }] },
  type: [{ coding: [{ system: `${BB}/codesystem/diagnosis-type`, code: principal ? "principal" : "secondary" }] }],
});
const money = (v: number) => ({ value: Math.round(v * 100) / 100, currency: "USD" });
const adj = (cat: string, v: number): Res => ({ category: { coding: [{ system: `${BB}/codesystem/adjudication`, code: cat }] }, amount: money(v) });

export function syntheticBlueButton(p: SyntheticProfile): { patient: Res; coverages: Res[]; eobs: Res[] } {
  const rnd = prng(p.key);
  const ri = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));
  const pid = `-${(Math.abs(hashCode(p.key)) % 90000000) + 10000000}`; // sandbox-style negative numeric ids
  const year = p.asOf.slice(0, 4);

  const patient: Res = {
    resourceType: "Patient",
    id: pid,
    meta: { profile: ["http://hl7.org/fhir/us/carin-bb/StructureDefinition/C4BB-Patient"] },
    identifier: [{ system: `${BB}/variables/bene_id`, value: pid }],
    name: [{ use: "usual", family: p.familyName, given: [p.givenName] }],
    gender: p.gender,
    birthDate: p.birthDate,
    address: [{ district: undefined, state: p.state ?? "51", postalCode: p.postalCode ?? "245" }],
  };

  const dualExt = (code: string) => Array.from({ length: 12 }, (_, i) => ({ url: `${BB}/variables/dual_${String(i + 1).padStart(2, "0")}`, valueCoding: { system: `${BB}/variables/dual_${String(i + 1).padStart(2, "0")}`, code } }));
  const coverage = (part: "a" | "b" | "c" | "d", status: string): Res => ({
    resourceType: "Coverage",
    id: `part-${part}-${pid}`,
    meta: { profile: ["http://hl7.org/fhir/us/carin-bb/StructureDefinition/C4BB-Coverage"] },
    status,
    type: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/v3-ActCode", code: part === "c" ? "HIP" : "SUBSIDIZ" }] },
    beneficiary: { reference: `Patient/${pid}` },
    period: { start: `${+year - ri(4, 15)}-${String(ri(1, 12)).padStart(2, "0")}-01` },
    payor: [{ display: part === "c" ? "Medicare Advantage plan (synthetic)" : "Centers for Medicare and Medicaid Services" }],
    class: [{ type: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/coverage-class", code: "plan" }] }, value: `Part ${part.toUpperCase()}`, name: `Part ${part.toUpperCase()}` }],
    extension: [
      { url: `${BB}/variables/ms_cd`, valueCoding: { system: `${BB}/variables/ms_cd`, code: "10", display: "Aged without ESRD" } },
      ...(part === "a" || part === "b" ? dualExt(p.dual ? "02" : "00") : []),
      ...(part === "d" ? [{ url: `${BB}/variables/ptdcntrct01`, valueCoding: { code: "S5601" } }, { url: `${BB}/variables/cstshr01`, valueCoding: { code: p.dual ? "01" : "09" } }] : []),
    ],
  });
  const coverages = [coverage("a", "active"), coverage("b", "active"), coverage("c", "cancelled"), coverage("d", "active")];

  const eobs: Res[] = [];
  let seq = 0;
  // Part D events
  for (const d of p.drugs) {
    const fills = d.fills ?? ri(3, 8);
    const supply = d.daysSupply ?? 30;
    for (let k = 0; k < fills; k++) {
      const fillOn = addDays(p.asOf, -((d.lastFillDaysAgo ?? ri(3, 25)) + k * supply + ri(-2, 2)));
      if (fillOn < `${+year - 1}-01-01`) break;
      const cost = ri(4, 180) + rnd();
      eobs.push({
        resourceType: "ExplanationOfBenefit",
        id: `pde-${pid}-${++seq}`,
        meta: { profile: ["http://hl7.org/fhir/us/carin-bb/StructureDefinition/C4BB-ExplanationOfBenefit-Pharmacy"] },
        status: "active",
        type: { coding: [{ system: `${BB}/codesystem/eob-type`, code: "PDE" }, { system: "http://terminology.hl7.org/CodeSystem/claim-type", code: "pharmacy" }] },
        patient: { reference: `Patient/${pid}` },
        billablePeriod: { start: fillOn, end: fillOn },
        careTeam: [{ sequence: 1, provider: { identifier: { system: "http://hl7.org/fhir/sid/us-npi", value: `1${ri(100000000, 999999999)}` } }, role: { coding: [{ code: "prescribing" }] } }],
        facility: { identifier: { system: "http://hl7.org/fhir/sid/us-npi", value: `1${ri(100000000, 999999999)}` }, display: "Pharmacy (synthetic)" },
        supportingInfo: [
          { sequence: 1, category: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/claiminformationcategory", code: "dayssupply" }] }, valueQuantity: { value: supply } },
          { sequence: 2, category: { coding: [{ code: "refillnum" }] }, valueQuantity: { value: k } },
          { sequence: 3, category: { coding: [{ code: "brandgenericindicator" }] }, code: { coding: [{ code: "G", display: "Generic" }] } },
        ],
        item: [
          {
            sequence: 1,
            productOrService: { coding: [{ system: "http://hl7.org/fhir/sid/ndc", code: d.ndc, display: `${d.name} ${d.strength}` }] },
            servicedDate: fillOn,
            quantity: { value: supply },
            adjudication: [adj("submitted", cost), adj("benefit", cost * (p.dual ? 0.98 : 0.75)), adj("paidbypatient", cost * (p.dual ? 0.02 : 0.25))],
          },
        ],
        total: [adj("submitted", cost)],
      });
    }
  }
  // Carrier (Part B professional) claims: office visits every ~3 months
  const dxCodes = [p.dementiaCode, ...p.comorbidities];
  for (let k = 0; k < 4; k++) {
    const d0 = addDays(p.asOf, -(ri(20, 40) + k * 91));
    const hcpcs = k % 2 === 0 ? "99214" : "99213";
    eobs.push({
      resourceType: "ExplanationOfBenefit",
      id: `carrier-${pid}-${++seq}`,
      meta: { profile: ["http://hl7.org/fhir/us/carin-bb/StructureDefinition/C4BB-ExplanationOfBenefit-Professional-NonClinician"] },
      status: "active",
      type: { coding: [{ system: `${BB}/codesystem/eob-type`, code: "CARRIER" }, { system: "http://terminology.hl7.org/CodeSystem/claim-type", code: "professional" }] },
      patient: { reference: `Patient/${pid}` },
      billablePeriod: { start: d0, end: d0 },
      provider: { identifier: { system: "http://hl7.org/fhir/sid/us-npi", value: `1${ri(100000000, 999999999)}` }, display: "Primary care (synthetic)" },
      diagnosis: dxCodes.slice(0, 4).map((c, i) => dx(c, i + 1, i === 0)),
      item: [
        {
          sequence: 1,
          productOrService: { coding: [{ system: "https://www.cms.gov/Medicare/Coding/HCPCSReleaseCodeSets", code: hcpcs, display: `Office visit, established patient (${hcpcs})` }] },
          servicedDate: d0,
          locationCodeableConcept: { coding: [{ system: `${BB}/variables/line_place_of_srvc_cd`, code: "11", display: "Office" }] },
          adjudication: [adj("submitted", 165), adj("benefit", 98.4), adj("paidbypatient", p.dual ? 0 : 24.6)],
        },
      ],
      total: [adj("submitted", 165)],
    });
  }
  // Annual wellness + cognitive assessment in the prior year, for some
  if (rnd() < 0.5) {
    const d0 = addDays(p.asOf, -ri(300, 420));
    eobs.push({
      resourceType: "ExplanationOfBenefit",
      id: `carrier-${pid}-${++seq}`,
      status: "active",
      type: { coding: [{ system: `${BB}/codesystem/eob-type`, code: "CARRIER" }] },
      patient: { reference: `Patient/${pid}` },
      billablePeriod: { start: d0, end: d0 },
      provider: { display: "Primary care (synthetic)" },
      diagnosis: [dx(p.dementiaCode, 1, true)],
      item: [
        { sequence: 1, productOrService: { coding: [{ system: "https://www.cms.gov/Medicare/Coding/HCPCSReleaseCodeSets", code: "G0439", display: "Annual wellness visit, subsequent" }] }, servicedDate: d0, adjudication: [adj("submitted", 140), adj("benefit", 140)] },
        { sequence: 2, productOrService: { coding: [{ system: "https://www.cms.gov/Medicare/Coding/HCPCSReleaseCodeSets", code: "99483", display: "Assessment of and care planning for a patient with cognitive impairment" }] }, servicedDate: d0, adjudication: [adj("submitted", 280), adj("benefit", 268)] },
      ],
      total: [adj("submitted", 420)],
    });
  }
  // Outpatient / ED visit
  if (p.edVisitDaysAgo !== undefined) {
    const d0 = addDays(p.asOf, -p.edVisitDaysAgo);
    eobs.push({
      resourceType: "ExplanationOfBenefit",
      id: `outpatient-${pid}-${++seq}`,
      meta: { profile: ["http://hl7.org/fhir/us/carin-bb/StructureDefinition/C4BB-ExplanationOfBenefit-Outpatient-Institutional"] },
      status: "active",
      type: { coding: [{ system: `${BB}/codesystem/eob-type`, code: "OUTPATIENT" }, { system: "http://terminology.hl7.org/CodeSystem/claim-type", code: "institutional" }] },
      patient: { reference: `Patient/${pid}` },
      billablePeriod: { start: d0, end: d0 },
      provider: { display: "Regional medical center (synthetic)" },
      facility: { display: "Hospital outpatient / emergency department", extension: [{ url: `${BB}/variables/clm_fac_type_cd`, valueCoding: { code: "1" } }] },
      diagnosis: [dx(p.edReasonCode ?? "R41.82", 1, true), dx(p.dementiaCode, 2)],
      item: [{ sequence: 1, productOrService: { coding: [{ system: "https://www.cms.gov/Medicare/Coding/HCPCSReleaseCodeSets", code: "99284", display: "Emergency department visit, moderate" }] }, servicedDate: d0, adjudication: [adj("submitted", 1240), adj("benefit", 980)] }],
      total: [adj("submitted", 1240)],
    });
  }
  return { patient, coverages, eobs };
}

function hashCode(s: string): number {
  let h = 0;
  for (const ch of s) h = (Math.imul(31, h) + ch.charCodeAt(0)) | 0;
  return h;
}
