import type { CaregiverAccount, ClinicSite, ConsentRecord, Household, MedicareImport } from "@/lib/domain/types";
import { careTerm } from "@/lib/domain/care-terms";
import { ALL_SCOPES, buildConsent } from "@/lib/engine";
import { coverageSummary } from "@/lib/integrations/bluebutton";
import { applyMedicareImport } from "./medicare-apply";

export interface PatientFacts {
  givenName: string;
  familyName: string;
  birthDate: string;
  sex: "F" | "M";
  coverage: Household["patient"]["coverage"];
  hasDementiaDiagnosis: boolean;
}

/** What the confirmation screen shows, from a Blue Button import. */
export function patientFactsFromImport(imp: MedicareImport, fallbackSex: "F" | "M" = "F"): PatientFacts | undefined {
  const p = imp.patient;
  if (!p) return undefined;
  const cov = coverageSummary(imp);
  return {
    givenName: p.givenName ?? "",
    familyName: p.familyName ?? "",
    birthDate: p.birthDate ?? "",
    sex: p.gender === "male" ? "M" : p.gender === "female" ? "F" : fallbackSex,
    coverage: { partA: cov.partA, partB: cov.partB, partC: cov.partC, partD: cov.partD, medicaid: cov.dual },
    hasDementiaDiagnosis: imp.eobs.some((e) => e.diagnoses.some((d) => /^(G30|F01|F02|F03|G31\.83)/.test(d.coding.code))),
  };
}

/**
 * Create the household for a self-registered caregiver: her account becomes the primary caregiver
 * (proxy self-attested, all scopes, pending clinic confirmation), the signed authorization is recorded,
 * and, when Medicare was connected first, the import fills coverage, diagnoses and medicines.
 */
export function buildSelfRegisteredHousehold(input: { ids: { household: string; caregiver: string; patient: string; consent: string }; account: CaregiverAccount; facts: PatientFacts; site: ClinicSite; asOf: string; imp?: MedicareImport; patientRef?: string; mode: "mock" | "live" }): { h: Household; consent: ConsentRecord } {
  const { account: a, facts, site, asOf, ids } = input;
  const d = a.pending ?? { startedAt: new Date().toISOString() };
  const t = careTerm(d.term);
  const c = d.consent!;
  const consent = buildConsent({ id: ids.consent, caregiverId: ids.caregiver, basis: c.basis, typedSignature: c.typedSignature, signedAt: c.signedAt, asOf, shareDirectory: c.shareDirectory, shareEvaluator: c.shareEvaluator, attestedFrom: c.attestedFrom, patientSignature: c.patientSignature });
  const lives = d.livesWith ?? true;
  const localityFips = d.localityFips || a.localityFips;
  const h: Household = {
    id: ids.household,
    siteId: site.id,
    origin: "self_registered",
    patient: {
      id: ids.patient,
      givenName: facts.givenName,
      familyName: facts.familyName,
      birthDate: facts.birthDate,
      sex: facts.sex,
      mbi: "SYNTHETIC",
      coverage: facts.coverage,
      residence: lives ? "family_home" : "own_home",
      localityFips,
      diagnoses: facts.hasDementiaDiagnosis ? [{ code: "F03.90", display: "Dementia (type to be confirmed by the clinic)" }] : [],
      term: d.term,
    },
    caregivers: [
      {
        id: ids.caregiver,
        accountId: a.id,
        givenName: a.givenName,
        familyName: a.familyName,
        birthDate: a.birthDate,
        relationship: t.relationship,
        livesWithPatient: lives,
        localityFips: a.localityFips,
        phone: a.phone,
        email: a.email,
        access: a.access,
        isPrimary: true,
        identity: a.identity,
        proxy: { status: "self_attested", requestedOn: asOf, consentBasis: c.basis, consentRecordedOn: asOf, scope: ALL_SCOPES },
        health: { phq2: [], bp: [], zbi: [], hasHomeBpCuff: false },
        hoursPerWeek: lives ? 40 : 10,
      },
    ],
    consents: [consent],
    status: "enrolling",
    enrolledOn: asOf,
    referralSource: "self",
    carePlan: { tier: null, contactCadenceDays: 30, goals: [], watchFor: ["Sudden change in confusion", "Fall", "Not drinking or new trouble urinating", "Frightening behavior or trying to leave the house"], whoToCall: [{ label: `${site.orgName} (daytime)`, phone: site.phone }, { label: "Emergency", phone: "911" }] },
    medications: [],
    medicareFills: [],
    medicare: { connected: false },
    symptomLog: [],
    appointments: [],
    messages: [],
    contacts: [],
    referrals: [],
    escalations: [],
    edVisits: [],
    summaries: [],
  };
  if (input.imp) applyMedicareImport(h, input.imp, { asOf, mode: input.mode, patientRef: input.patientRef });
  return { h, consent };
}
