# CareShare: product requirements

Status: pilot baseline build on synthetic data (October 2026), prepared as the technology baseline for Vivid Solutions' application to the Virginia Rural Health Transformation Program, CareIQ Tech Innovation Fund (VIPC RFA C-27-002). CLAUDE.md says how to build it; this says what it must do and why.

## 1. Problem

Dementia is a chronic disease managed almost entirely by unpaid family caregivers. In rural Virginia the memory specialist is 60–120 miles away and few clinics run structured dementia care, so the caregiver is the care manager by default: she reconciles medications across prescribers, tracks behavior, and catches the infection before it becomes the emergency visit. She has no verified standing in any provider's system; proxy access is paper, provider by provider, and silently expires. The rural primary care clinic has no structured way to receive what she knows. Seven in ten of these caregivers have a chronic condition of their own and about three in ten screen positive for depression; nobody measures it.

The target geography is Southside Virginia (Danville, Pittsylvania, Halifax at go-live; Henry and Martinsville from month four; Mecklenburg if capacity allows), the rural region with the most people living with Alzheimer's at the highest prevalence, served by one FQHC network, an Area Agency on Aging already running Alzheimer's respite, and a hospital newly funded to share admission data. Eastern Shore is phase two; Southern Piedmont is the named alternate.

## 2. Users

- **Family caregiver** (primary user of the Caregiver face): spouse, daughter, son, neighbor. Often older, often without broadband, sometimes without a smartphone.
- **Person living with dementia**: may hold the phone in the mild stage; the plan is readable by both.
- **Clinic care team** (primary user of the Console): RN care coordinator, NP/PA, physician, enrollment coordinator, OT (caregiver training), behavioral health.
- **Later:** Area Agency on Aging staff (referral view), hospital discharge planner (ADT in), evaluator (outcomes export), directory partner (closed-loop receipts).

## 3. Scope of this build

Implemented, on synthetic data, with every external seam mocked by default and live adapters behind environment switches:

**Caregiver face**
- Demo sign-in as a seeded caregiver; identity verification via CLEAR or ID.me (mock vendor page or live OIDC sandbox); failure path offers in-person verification at the clinic.
- Gate: no record content until verified at IAL2 and confirmed as representative by the clinic. Own-health check-ins allowed once verified.
- Home: next visit and ride status, things to act on, watch-for list, who to call.
- Care plan: tier in plain words, cadence, goals by owner, respite arrangement, diagnoses.
- Medicines: one shared list with source badges; add a medicine; discrepancies the clinic wants to check; connect Medicare (Blue Button 2.0 mock or live) and see fills.
- Log: falls, confusion, behavior, wandering, sleep, appetite, bathroom changes, pain, mood; severity; free text.
- Visits and rides: upcoming and past; request a ride; local ride services.
- Messages: secure thread with the clinic.
- My check-in: ZBI-12 (paraphrased prompts; licensed wording before real use), PHQ-2, home blood pressure, own primary care visit.
- Help nearby: directory listings for the locality with outcome reporting (closed loop).
- Printable one-page summary.

**Clinic Console**
- Demo sign-in by role.
- Today: critical signals to call on, contacts due, access to open.
- Households roster with locality/status filters, tier, cadence, signal counts.
- Household detail: overview (escalations with acknowledge/resolve, tier and cadence, household facts), caregiver and access (identity status, text the link, in-person verification attestation, proxy confirmation with consent basis, revoke, caregiver health with PHQ-2 routing, SMS prompts), care plan (goals, respite, staging and tier recompute, EHR link and CarePlan write), medications (reconciliation against claims with adopt/stop/confirm actions, clinic list, Part D fills), symptom log and ED visits, visits (schedule, arrange ride, complete/missed), messages, contacts (log with minutes and documentation stream), referrals (closed loop with report-back), monthly summary and documentation export, evidence (audit).
- Proxy confirmation queue; escalation queue with rule filter; pilot outcomes by KPO and locality; enroll a household; integrations status; evidence trail.

Out of scope for this build (designed for, not built): Postgres store; real SSO and caregiver login via the CSP; live directory API; ADT feed from the hospital; 837P/claims; evaluator export; Spanish; offline-first PWA (the printable summary and SMS fallback stand in).

## 4. Rules the engine implements

| Rule | Where | Source |
| --- | --- | --- |
| Stage: CDR 1 / FAST 4 mild; CDR 2–3 / FAST 5–7 moderate/severe; CDR 0/0.5, FAST 1–3 do not stage; CDR governs a conflict | `tiering.ts` | CMS GUIDE FAQ tier table (structure adapted); CDR, FAST instruments |
| Burden: ZBI-12, high at 17 or more | `tiering.ts` | Bédard et al. 2001 |
| Five tiers; cadence 30 / 14 / 7 days | `tiering.ts`, `cadence.ts` | Adapted from CMS GUIDE contact conventions; pilot floors |
| Depression screen: PHQ-2 at 3 or more is positive, routed never diagnosed | `signals.ts` | Kroenke et al. 2003 |
| Blood pressure: 180/120 or more is a crisis; two readings at 140/90 or more in 30 days is elevated | `signals.ts` | ACC/AHA 2017 thresholds; clinical advisor to confirm |
| UTI signs: urinary symptom and acute confusion/behavior change within 3 days | `signals.ts` | Common geriatric heuristic; advisor to confirm |
| Fall in 7 days, severe behavior in 7 days, wandering in 14 days | `signals.ts` | Pilot protocol |
| Medication reconciliation: filled-not-listed within 180 days; listed-not-filled beyond supply + 30 and 100 days | `reconciliation.ts` | Pilot protocol |
| Cadence overdue, missed visit, ride not arranged within 7 days, ED visit follow-up within 30 days, AWV and cognitive assessment within 12 months, caregiver own visit within 12 months | `signals.ts` | Pilot measures |
| FAST 7a or beyond: hospice-threshold conversation | `signals.ts` | Clinical convention |
| Outcome measures by KPO and Appendix A locality | `outcomes.ts` | RFA C-27-002 §4.2C, Appendix A |

## 5. Acceptance tests (behavioral)

- Given a verified caregiver whose proxy is not confirmed, when she opens any record page, then she is returned to Home with the waiting message, and her own check-in still works.
- Given a caregiver who fails remote verification twice, then her status becomes in-person pending and the Console offers the attested in-person path; confirming proxy before verification is refused and audited.
- Given a fall logged today, then a critical FALL_REPORTED escalation appears on Today and on the household within the same request.
- Given urinary symptoms and severe confusion logged two days apart, then UTI_SIGNS is raised.
- Given PHQ-2 of 3, then PHQ2_POSITIVE is raised; recording the warm hand-off resolves it and the outcomes measure counts it as routed.
- Given a Medicare fill not on the clinic list, then MED_DISCREPANCY is raised; adopting the drug and marking reconciliation complete clears it and makes reconciliation current.
- Given a ZBI-12 of 17 or more submitted by the primary caregiver of a moderate/severe household, then the tier becomes high and cadence weekly.
- Given an appointment within 7 days needing a ride, then TRANSPORT_UNARRANGED is raised; arranging the ride resolves it.
- Given a household in a non-Appendix-A locality, then it is excluded from People Served and every KPO measure.

`src/lib/engine/__tests__/engine.test.ts` covers the engine; the demo script exercises the pages.

## 6. Open questions for the clinical advisor and partner clinic

- Final thresholds for BP, UTI-signs window, fall window; whether NPI-Q is collected at baseline.
- Partner EHR vendor and whether it exposes SMART Backend Services for CarePlan and DocumentReference write.
- Consent basis handling for patients without capacity and without a POA.
- Which caregiver-training and care-management codes the clinic will bill from September 2027, so the documentation export matches.
- ZBI license (Mapi Research Trust) and the exact ZBI-12 wording; PHQ-2 is public domain.
