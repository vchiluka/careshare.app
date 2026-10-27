/**
 * Blue Button 2.0 FHIR R4 → MedicareImport.
 *
 * Shapes follow the CARIN Blue Button IG profiles CMS serves (C4BB Patient, Coverage, EOB Pharmacy /
 * Professional / Inpatient / Outpatient …) with the CMS Blue Button extensions summarized where care
 * coordination needs them. The same mapper runs on the live sandbox response and on the synthetic
 * bundle the mock produces, so what the pages show is the same either way.
 *
 * Not stored, deliberately: race/ethnicity extensions, MBI identifier values, full addresses.
 */

import type { BbCoding, BbCoverage, BbCoverageType, BbEob, BbEobItem, BbEobType, BbPatient, MedicareImport } from "@/lib/domain/types";

type Res = Record<string, unknown>;
export interface FhirBundle {
  resourceType?: "Bundle";
  entry?: { resource: Res }[];
  link?: { relation: string; url: string }[];
  total?: number;
}

const str = (v: unknown) => (typeof v === "string" ? v : undefined);
const num = (v: unknown) => (typeof v === "number" ? v : undefined);
const arr = <T = Res,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const coding = (cc: unknown): BbCoding | undefined => {
  const c = arr<Res>((cc as Res | undefined)?.coding)[0];
  if (!c || !str(c.code)) return undefined;
  return { system: str(c.system), code: str(c.code)!, display: str(c.display) };
};
const ext = (r: Res, urlPart: string): Res | undefined => arr<Res>(r.extension).find((e) => (str(e.url) ?? "").includes(urlPart));
const extCode = (r: Res, urlPart: string): string | undefined => {
  const e = ext(r, urlPart);
  return str((e?.valueCoding as Res | undefined)?.code) ?? str(e?.valueString) ?? str(e?.valueCode);
};
const date = (v: unknown) => str(v)?.slice(0, 10);

export function mapPatient(r: Res): BbPatient {
  const name = arr<Res>(r.name)[0];
  const address = arr<Res>(r.address)[0];
  return {
    id: str(r.id) ?? "",
    givenName: arr<string>(name?.given)[0],
    familyName: str(name?.family),
    birthDate: date(r.birthDate),
    gender: str(r.gender) as BbPatient["gender"],
    deceasedDate: date(r.deceasedDateTime),
    address: address ? { state: str(address.state), postalCode: str(address.postalCode)?.slice(0, 5), county: str(address.district) } : undefined,
  };
}

function coverageType(r: Res): BbCoverageType {
  const id = (str(r.id) ?? "").toLowerCase();
  const code = coding(r.type)?.code ?? "";
  const cls = arr<Res>(r.class).map((c) => `${str(c.value) ?? ""} ${str(c.name) ?? ""}`.toLowerCase()).join(" ");
  const t = `${id} ${code} ${cls}`;
  if (t.includes("part-a") || /\bpart a\b/.test(t)) return "Part A";
  if (t.includes("part-b") || /\bpart b\b/.test(t)) return "Part B";
  if (t.includes("part-c") || /\bpart c\b/.test(t)) return "Part C";
  if (t.includes("part-d") || /\bpart d\b/.test(t)) return "Part D";
  return "Unknown";
}

export function mapCoverage(r: Res): BbCoverage {
  const period = (r.period as Res | undefined) ?? {};
  const payor = arr<Res>(r.payor)[0];
  // Dual-eligibility is a monthly extension (dual_01 … dual_12); take the latest non-empty.
  const duals = arr<Res>(r.extension).filter((e) => /dual_\d\d/.test(str(e.url) ?? "")).map((e) => str((e.valueCoding as Res | undefined)?.code)).filter(Boolean) as string[];
  return {
    id: str(r.id) ?? "",
    type: coverageType(r),
    status: (str(r.status) as BbCoverage["status"]) ?? "active",
    periodStart: date(period.start),
    periodEnd: date(period.end),
    payor: str(payor?.display) ?? str(payor?.reference),
    dualCode: duals.at(-1),
    medicareStatusCode: extCode(r, "ms_cd"),
    partDContract: extCode(r, "ptdcntrct"),
    partDPbp: extCode(r, "ptdpbpid"),
    lowIncomeSubsidy: extCode(r, "cstshr"),
    partCContract: extCode(r, "ptc_cntrct"),
  };
}

function eobType(r: Res): BbEobType {
  const t = `${str(r.id) ?? ""} ${coding(r.type)?.code ?? ""} ${arr<Res>((r.type as Res | undefined)?.coding).map((c) => str(c.code)).join(" ")}`.toLowerCase();
  if (t.includes("pde") || t.includes("pharmacy")) return "pde";
  if (t.includes("carrier") || t.includes("professional")) return "carrier";
  if (t.includes("dme")) return "dme";
  if (t.includes("inpatient")) return "inpatient";
  if (t.includes("outpatient")) return "outpatient";
  if (t.includes("snf")) return "snf";
  if (t.includes("hha")) return "hha";
  if (t.includes("hospice")) return "hospice";
  return "unknown";
}

function amounts(adj: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  for (const a of arr<Res>(adj)) {
    const cat = coding(a.category);
    const v = num((a.amount as Res | undefined)?.value);
    if (cat && v !== undefined) out[cat.code] = Math.round(v * 100) / 100;
  }
  return out;
}

export function mapEob(r: Res): BbEob {
  const type = eobType(r);
  const bp = (r.billablePeriod as Res | undefined) ?? {};
  const prov = r.provider as Res | undefined;
  const provNpi = str((prov?.identifier as Res | undefined)?.value);
  const care = arr<Res>(r.careTeam);
  const prescriber = care.find((c) => (coding(c.role)?.code ?? "").includes("prescrib")) ?? care[0];
  const prescriberNpi = str(((prescriber?.provider as Res | undefined)?.identifier as Res | undefined)?.value);
  const info = arr<Res>(r.supportingInfo);
  const infoBy = (needle: string) => info.find((i) => JSON.stringify(i.category ?? {}).toLowerCase().includes(needle));
  const facility = r.facility as Res | undefined;
  return {
    id: str(r.id) ?? "",
    type,
    status: str(r.status),
    billablePeriodStart: date(bp.start),
    billablePeriodEnd: date(bp.end),
    provider: prov ? { npi: provNpi, display: str(prov.display) } : undefined,
    facility: facility ? { display: str(facility.display), typeCode: extCode(facility, "fac_type") } : undefined,
    diagnoses: arr<Res>(r.diagnosis).flatMap((d) => {
      const c = coding(d.diagnosisCodeableConcept);
      return c ? [{ sequence: num(d.sequence) ?? 0, coding: c, type: coding(arr<Res>(d.type)[0])?.code }] : [];
    }),
    procedures: arr<Res>(r.procedure).flatMap((p) => {
      const c = coding(p.procedureCodeableConcept);
      return c ? [{ sequence: num(p.sequence) ?? 0, coding: c, date: date(p.date) }] : [];
    }),
    items: arr<Res>(r.item).map(
      (it): BbEobItem => ({
        sequence: num(it.sequence) ?? 0,
        productOrService: coding(it.productOrService),
        servicedDate: date(it.servicedDate) ?? date((it.servicedPeriod as Res | undefined)?.start),
        servicedEnd: date((it.servicedPeriod as Res | undefined)?.end),
        quantity: num((it.quantity as Res | undefined)?.value),
        amounts: amounts(it.adjudication),
        locationCode: coding(it.locationCodeableConcept)?.code,
      }),
    ),
    pharmacy:
      type === "pde"
        ? {
            daysSupply: num((infoBy("dayssupply")?.valueQuantity as Res | undefined)?.value),
            fillNumber: num((infoBy("refillnum")?.valueQuantity as Res | undefined)?.value),
            pharmacyNpi: str((facility?.identifier as Res | undefined)?.value),
            prescriberNpi,
            brandGeneric: coding(infoBy("brandgenericindicator")?.code)?.code,
          }
        : undefined,
    totals: amounts(r.total),
  };
}

export function mapBlueButton(input: { patient?: Res; coverages: Res[]; eobs: Res[]; pulledOn: string; source: "mock" | "live"; baseUrl?: string }): MedicareImport {
  const eobs = input.eobs.map(mapEob);
  return {
    pulledOn: input.pulledOn,
    source: input.source,
    baseUrl: input.baseUrl,
    patient: input.patient ? mapPatient(input.patient) : undefined,
    coverages: input.coverages.map(mapCoverage),
    eobs,
    counts: {
      coverages: input.coverages.length,
      eobs: eobs.length,
      pde: eobs.filter((e) => e.type === "pde").length,
      carrier: eobs.filter((e) => e.type === "carrier" || e.type === "dme").length,
      institutional: eobs.filter((e) => ["inpatient", "outpatient", "snf", "hha", "hospice"].includes(e.type)).length,
    },
  };
}

export function resourcesOf(b: FhirBundle): Res[] {
  return (b.entry ?? []).map((e) => e.resource).filter(Boolean);
}

// ---------- Derivations the rest of the app consumes ----------

/** Part D fills in the shape reconciliation.ts already understands. */
export function fillsFromImport(imp: MedicareImport): { ndc: string; name: string; strength: string; fillOn: string; daysSupply: number }[] {
  const out = [];
  for (const e of imp.eobs.filter((x) => x.type === "pde")) {
    const it = e.items[0];
    const c = it?.productOrService;
    if (!c?.code) continue;
    const display = c.display ?? "unknown drug";
    const m = display.match(/^(.*?)(\s+\d.*)?$/);
    out.push({ ndc: c.code, name: (m?.[1] ?? display).trim().toLowerCase(), strength: (m?.[2] ?? "").trim(), fillOn: it.servicedDate ?? e.billablePeriodStart ?? imp.pulledOn, daysSupply: e.pharmacy?.daysSupply ?? 30 });
  }
  return out;
}

/** Distinct ICD-10-CM codes across claims, most recent first, for the "diagnoses on claims" panel. */
export function diagnosesFromImport(imp: MedicareImport): { code: string; display?: string; lastSeen: string; claims: number }[] {
  const m = new Map<string, { code: string; display?: string; lastSeen: string; claims: number }>();
  for (const e of imp.eobs) {
    const d0 = e.billablePeriodStart ?? "";
    for (const d of e.diagnoses) {
      const cur = m.get(d.coding.code);
      if (cur) {
        cur.claims += 1;
        if (d0 > cur.lastSeen) cur.lastSeen = d0;
        cur.display ??= d.coding.display;
      } else m.set(d.coding.code, { code: d.coding.code, display: d.coding.display, lastSeen: d0, claims: 1 });
    }
  }
  return [...m.values()].sort((a, b) => b.lastSeen.localeCompare(a.lastSeen) || b.claims - a.claims);
}

export function coverageSummary(imp: MedicareImport): { partA: boolean; partB: boolean; partC: boolean; partD: boolean; dual: boolean } {
  const active = (t: BbCoverageType) => imp.coverages.some((c) => c.type === t && c.status === "active");
  const dual = imp.coverages.some((c) => c.dualCode && !["00", "NA", "09", "99"].includes(c.dualCode));
  return { partA: active("Part A"), partB: active("Part B"), partC: active("Part C"), partD: active("Part D"), dual };
}
