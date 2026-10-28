/**
 * FHIR R4 export of a household's care record: what a caregiver hands to a provider who is not on the
 * platform (the memory clinic, the emergency department, adult day). The same bundle is what an EHR
 * "Kill the Clipboard" check-in ingests and what a SMART Health Link carries.
 *
 * Resources (US Core / CARIN shapes where they exist):
 *   Patient, RelatedPerson (the verified caregiver), Consent (the signed authorization),
 *   Condition (diagnoses), MedicationStatement (one per listed medicine), CarePlan (goals, watch-for,
 *   who to call), AllergyIntolerance is not tracked, Observation (latest caregiver ZBI-12 and PHQ-2 as
 *   survey scores), DocumentReference (latest monthly summary as text), Encounter (ED visits).
 *
 * No MBI, no identity-provider subjects, no audit, no message bodies.
 */

import type { Household, Caregiver } from "@/lib/domain/types";

type R = Record<string, unknown>;

export function exportHouseholdBundle(h: Household, opts: { asOf: string; caregiverId?: string; baseUrl?: string; siteName?: string }): R {
  const base = opts.baseUrl ?? "urn:careshare";
  const ref = (type: string, id: string) => ({ reference: `${type}/${id}` });
  const entries: R[] = [];
  const push = (resource: R) => entries.push({ fullUrl: `${base}/${resource.resourceType}/${resource.id}`, resource });

  const p = h.patient;
  push({
    resourceType: "Patient",
    id: p.id,
    meta: { profile: ["http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient"] },
    name: [{ family: p.familyName, given: [p.givenName] }],
    birthDate: p.birthDate,
    gender: p.sex === "F" ? "female" : "male",
    address: [{ state: "VA", district: p.localityFips }],
  });

  const caregivers = opts.caregiverId ? h.caregivers.filter((c) => c.id === opts.caregiverId) : h.caregivers.filter((c) => c.identity.status === "verified");
  for (const c of caregivers) push(relatedPerson(c, p.id));

  for (const c of caregivers) {
    const consent = [...(h.consents ?? [])].filter((x) => x.caregiverId === c.id && x.status === "active").at(-1);
    if (consent)
      push({
        resourceType: "Consent",
        id: consent.id,
        status: "active",
        scope: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/consentscope", code: "patient-privacy" }] },
        category: [{ coding: [{ system: "http://loinc.org", code: "59284-0", display: "Patient Consent" }] }],
        patient: ref("Patient", p.id),
        dateTime: consent.signedAt,
        performer: [ref("RelatedPerson", c.id)],
        policyRule: { text: `CareShare authorization v${consent.version}; basis: ${consent.basis}` },
        provision: {
          type: "permit",
          period: { start: consent.signedAt.slice(0, 10), end: consent.expiresOn },
          actor: [{ role: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/v3-ParticipationType", code: "IRCP" }] }, reference: ref("RelatedPerson", c.id) }],
        },
      });
  }

  p.diagnoses.forEach((d, i) =>
    push({
      resourceType: "Condition",
      id: `${p.id}-cond-${i + 1}`,
      meta: { profile: ["http://hl7.org/fhir/us/core/StructureDefinition/us-core-condition-problems-health-concerns"] },
      clinicalStatus: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/condition-clinical", code: "active" }] },
      category: [{ coding: [{ system: "http://terminology.hl7.org/CodeSystem/condition-category", code: "problem-list-item" }] }],
      code: { coding: [{ system: "http://hl7.org/fhir/sid/icd-10-cm", code: d.code, display: d.display }], text: d.display },
      subject: ref("Patient", p.id),
      onsetDateTime: d.onset,
    }),
  );

  for (const m of h.medications.filter((x) => x.status !== "stopped")) {
    push({
      resourceType: "MedicationStatement",
      id: m.id,
      status: m.status === "active" ? "active" : "unknown",
      medicationCodeableConcept: { coding: m.ndc ? [{ system: "http://hl7.org/fhir/sid/ndc", code: m.ndc, display: `${m.name} ${m.strength ?? ""}`.trim() }] : undefined, text: `${m.name} ${m.strength ?? ""}`.trim() },
      subject: ref("Patient", p.id),
      dosage: m.sig ? [{ text: m.sig }] : undefined,
      informationSource: m.source === "caregiver" && caregivers[0] ? ref("RelatedPerson", caregivers[0].id) : undefined,
      note: [{ text: `Source: ${m.source}${m.status === "unverified" ? "; not yet confirmed by the clinic" : ""}${m.lastFillOn ? `; last Part D fill ${m.lastFillOn}` : ""}` }],
    });
  }

  if (h.carePlan) {
    push({
      resourceType: "CarePlan",
      id: `${h.id}-plan`,
      meta: { profile: ["http://hl7.org/fhir/us/core/StructureDefinition/us-core-careplan"] },
      status: "active",
      intent: "plan",
      category: [{ coding: [{ system: "http://hl7.org/fhir/us/core/CodeSystem/careplan-category", code: "assess-plan" }] }],
      title: `Dementia care plan${h.carePlan.tier ? ` (tier ${h.carePlan.tier})` : ""}`,
      subject: ref("Patient", p.id),
      created: h.carePlan.reviewedOn,
      description: [`Contact cadence every ${h.carePlan.contactCadenceDays} days.`, h.carePlan.respiteArrangement ? `Respite: ${h.carePlan.respiteArrangement}` : "", `Watch for: ${h.carePlan.watchFor.join("; ")}.`, `Who to call: ${h.carePlan.whoToCall.map((w) => `${w.label} ${w.phone}`).join("; ")}.`].filter(Boolean).join(" "),
      activity: h.carePlan.goals.map((g) => ({ detail: { kind: "Task", status: g.status === "met" ? "completed" : g.status === "dropped" ? "cancelled" : "in-progress", description: `${g.text} (owner: ${g.owner})` } })),
    });
  }

  for (const c of caregivers) {
    const z = c.health.zbi.at(-1);
    if (z)
      push({
        resourceType: "Observation",
        id: `${c.id}-zbi-${z.date}`,
        status: "final",
        category: [{ coding: [{ system: "http://terminology.hl7.org/CodeSystem/observation-category", code: "survey" }] }],
        code: { text: "Zarit Burden Interview, 12-item (caregiver strain)" },
        subject: ref("RelatedPerson", c.id),
        focus: [ref("Patient", p.id)],
        effectiveDateTime: z.date,
        valueInteger: z.total,
      });
    const q = c.health.phq2.at(-1);
    if (q)
      push({
        resourceType: "Observation",
        id: `${c.id}-phq2-${q.date}`,
        status: "final",
        category: [{ coding: [{ system: "http://terminology.hl7.org/CodeSystem/observation-category", code: "survey" }] }],
        code: { coding: [{ system: "http://loinc.org", code: "55758-7", display: "PHQ-2 total score" }] },
        subject: ref("RelatedPerson", c.id),
        effectiveDateTime: q.date,
        valueInteger: q.total,
        note: q.total >= 3 ? [{ text: "Positive screen; routed to the caregiver's own provider. Not a diagnosis." }] : undefined,
      });
  }

  for (const e of h.edVisits)
    push({
      resourceType: "Encounter",
      id: `${h.id}-ed-${e.date}`,
      status: "finished",
      class: { system: "http://terminology.hl7.org/CodeSystem/v3-ActCode", code: "EMER", display: "emergency" },
      subject: ref("Patient", p.id),
      period: { start: e.date },
      reasonCode: [{ text: e.reason }],
    });

  const summary = h.summaries.at(-1);
  if (summary)
    push({
      resourceType: "DocumentReference",
      id: `${h.id}-summary-${summary.month}`,
      status: "current",
      type: { coding: [{ system: "http://loinc.org", code: "34133-9", display: "Summarization of episode note" }] },
      subject: ref("Patient", p.id),
      date: `${summary.month}-01T00:00:00Z`,
      description: `CareShare monthly caregiver summary, ${summary.month}`,
      content: [{ attachment: { contentType: "text/plain", data: Buffer.from(summaryText(summary)).toString("base64"), title: `Monthly summary ${summary.month}` } }],
    });

  return {
    resourceType: "Bundle",
    id: `${h.id}-share-${opts.asOf}`,
    type: "collection",
    timestamp: new Date().toISOString(),
    meta: { source: opts.siteName ? `CareShare / ${opts.siteName}` : "CareShare" },
    entry: entries,
  };
}

function relatedPerson(c: Caregiver, patientId: string): R {
  const rel: Record<string, string> = { spouse: "SPS", daughter: "DAUC", son: "SONC", child: "CHILD", daughter_in_law: "DAUINLAW", sibling: "SIB", grandchild: "GRNDCHILD", friend_neighbor: "FRND", other: "FAMMEMB" };
  return {
    resourceType: "RelatedPerson",
    id: c.id,
    meta: { profile: ["http://hl7.org/fhir/us/core/StructureDefinition/us-core-relatedperson"] },
    active: true,
    patient: { reference: `Patient/${patientId}` },
    relationship: [{ coding: [{ system: "http://terminology.hl7.org/CodeSystem/v3-RoleCode", code: rel[c.relationship] ?? "FAMMEMB" }], text: c.relationship.replaceAll("_", " ") }],
    name: [{ family: c.familyName, given: [c.givenName] }],
    telecom: [{ system: "phone", value: c.phone }],
    extension: [{ url: "https://careshare.app/fhir/StructureDefinition/identity-assurance", valueString: c.identity.status === "verified" ? `${c.identity.assurance}/${c.identity.authenticator} verified ${c.identity.verifiedOn}` : c.identity.status }],
  };
}

function summaryText(s: Household["summaries"][number]): string {
  const o = s as unknown as Record<string, unknown>;
  const lines: string[] = [`CareShare monthly summary for ${s.month}`];
  for (const [k, v] of Object.entries(o)) {
    if (k === "month") continue;
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") lines.push(`${k}: ${v}`);
    else if (Array.isArray(v)) lines.push(`${k}: ${v.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join("; ")}`);
    else if (v && typeof v === "object") lines.push(`${k}: ${JSON.stringify(v)}`);
  }
  return lines.join("\n");
}
