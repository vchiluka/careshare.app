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
- Two ways in: a caregiver the clinic enrolled (demo sign-in as a seeded caregiver), or self-service registration, identity first (`/care/register`: CLEAR or ID.me → about you, prefilled from verified attributes when released → `/care/start`).
- Adding the person you care for (`/care/add-patient`) is Medicare first, one question per screen, in the caregiver's own words ("your mom"): who → can you get into their Medicare account (login / card but no account, with a walkthrough to create one / no Medicare) → the authorization, with the legal basis asked as a question → Medicare.gov hand-off (Blue Button 2.0) → "Is this your mom?" confirmation from the Patient and Coverage resources, with a Medicare Advantage caveat → the household is created and the caregiver lands on the medicine list already filled from Part D. The typed-details form is the no-Medicare exception path and ends on the same confirmation. The draft lives on the account, so stopping and resuming works. Self-registered households land unassigned at the clinic site for the patient's locality.
- Identity verification via CLEAR or ID.me (mock vendor page or live OIDC sandbox); failure path offers in-person verification at the clinic.
- Gate, three parts in order: verified at IAL2; proxy confirmed by the clinic (or self-attested after self-registration until the clinic confirms); a signed authorization that has not lapsed. The authorization (`/care/consent`) names the basis (patient consent, health care POA, guardianship), is signed by typing the name, records time and a truncated request fingerprint, lasts 90 days, re-prompts from 14 days out, and can be revoked at any time. A lapsed or revoked authorization closes the record but not the caregiver's own check-ins.
- Guides (`/care/learn`): fourteen short education items by topic, ordered by the patient's FAST stage when the clinic has recorded one; open before the record is.
- Share with a provider (`/care/share`): a 72-hour, PIN-protected link and QR code (SMART Health Link payload offered alongside the plain URL) that opens a read-only view of the plan, medicines, who to call and recent emergency visits for anyone not on the platform, with the same content downloadable as a FHIR R4 Bundle (Patient, RelatedPerson, Consent, Condition, MedicationStatement, CarePlan, Observation, Encounter, DocumentReference). Secret and PIN are stored hashed; every open is audited; the caregiver can withdraw a link.
- Care circle (`/care/circle`): who is verified on the record; invite a second caregiver by single-use code; she registers and verifies herself, joins, and signs her own authorization (self-attested on self-registered households, clinic-confirmed on clinic-enrolled ones). The authorization form lets the patient co-sign when the basis is her own consent.
- Phone-first layout: sticky compact header, bottom bar with the four most-used sections and More, one-row-per-answer check-in tiles, full-width primary actions, no horizontal scroll at 390px on any caregiver page; installable to the home screen (web manifest). The clinic console collapses its sidebar to a scrolling top strip on phones.
- Help right now (`/care/help-now`): 911, 988, the 24-hour dementia helpline, poison control and the clinic line in large type, open before verification.
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
- Sign-in with CLEAR or ID.me (new staff land pending until an administrator approves them and sets role and site) or the demo role picker.
- Administration (`/clinic/admin`, admins only): approve or decline pending staff; assign each household a clinical lead (physician, NP/PA or RN); caseload by lead; reassign. The lead shows on the household header and roster; Today counts the signed-in person's own households and the unassigned ones; the roster filters by lead ("Mine", "Unassigned").
- Alert-fatigue control: non-critical escalations can be snoozed 3 to 30 days; snoozed items leave the queue and the household overview and return on the date; the rule keeps running.
- Evaluator export (`/api/export/evaluator`, admins only): de-identified CSV, one row per household whose caregiver's current authorization includes evaluator sharing; salted household hash, months not dates, locality FIPS; each download audited. Measurement cadence signals (ZBI baseline due at 14 days, follow-up due at 60 days) keep the strain measure populated.
- Today: critical signals to call on, contacts due, access to open.
- Households roster with locality/status filters, tier, cadence, signal counts.
- Household detail: overview (escalations with acknowledge/resolve, tier and cadence, household facts), caregiver and access (identity status, text the link, in-person verification attestation, proxy confirmation with consent basis, revoke, caregiver health with PHQ-2 routing, SMS prompts), care plan (goals, respite, staging and tier recompute, EHR link and CarePlan write), medications (reconciliation against claims with adopt/stop/confirm actions, clinic list, Part D fills), symptom log and ED visits, visits (schedule, arrange ride, complete/missed), messages, contacts (log with minutes and documentation stream), referrals (closed loop with report-back), monthly summary and documentation export, evidence (audit).
- Proxy confirmation queue; escalation queue with rule filter; pilot outcomes by KPO and locality; enroll a household; integrations status; evidence trail.

Out of scope for this build (designed for, not built): caregiver login (as opposed to proofing) via the CSP; live directory API; ADT feed from the hospital; 837P/claims; evaluator export; Spanish; offline-first PWA (the printable summary and SMS fallback stand in).

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
| ZBI-12 baseline due 14 days after enrollment; follow-up due 60 days after the last | `signals.ts` | Pilot measurement protocol |
| Outcome measures by KPO and Appendix A locality | `outcomes.ts` | RFA C-27-002 §4.2C, Appendix A |

## 5. Acceptance tests (behavioral)

- Given a verified caregiver whose proxy is not confirmed, when she opens any record page, then she is returned to Home with the waiting message, and her own check-in still works.
- Given a confirmed caregiver whose authorization lapsed (signed more than 90 days ago), when she opens any record page, then she is sent to the authorization page; signing again reopens the record; revoking closes it immediately and is audited.
- Given a self-registered caregiver who is verified, when she adds a patient and signs, then a household exists at the site for that locality with origin self_registered, proxy self_attested, an active consent, no lead, and her record view is open; connecting Medicare seeds diagnoses and unverified medications from claims.
- Given staff who sign in through CLEAR for the first time, then they can reach only the pending page until an administrator approves them.
- Given a caregiver who fails remote verification twice, then her status becomes in-person pending and the Console offers the attested in-person path; confirming proxy before verification is refused and audited.
- Given a fall logged today, then a critical FALL_REPORTED escalation appears on Today and on the household within the same request.
- Given urinary symptoms and severe confusion logged two days apart, then UTI_SIGNS is raised.
- Given PHQ-2 of 3, then PHQ2_POSITIVE is raised; recording the warm hand-off resolves it and the outcomes measure counts it as routed.
- Given a Medicare fill not on the clinic list, then MED_DISCREPANCY is raised; adopting the drug and marking reconciliation complete clears it and makes reconciliation current.
- Given a ZBI-12 of 17 or more submitted by the primary caregiver of a moderate/severe household, then the tier becomes high and cadence weekly.
- Given an appointment within 7 days needing a ride, then TRANSPORT_UNARRANGED is raised; arranging the ride resolves it.
- Given a household in a non-Appendix-A locality, then it is excluded from People Served and every KPO measure.

`src/lib/engine/__tests__/` covers the engine and consent; `src/lib/integrations/bluebutton/__tests__/` covers the FHIR mapper; the demo script exercises the pages.

## 6. Open questions for the clinical advisor and partner clinic

- Final thresholds for BP, UTI-signs window, fall window; whether NPI-Q is collected at baseline.
- Partner EHR vendor and whether it exposes SMART Backend Services for CarePlan and DocumentReference write.
- Consent basis handling for patients without capacity and without a POA.
- Which caregiver-training and care-management codes the clinic will bill from September 2027, so the documentation export matches.
- ZBI license (Mapi Research Trust) and the exact ZBI-12 wording; PHQ-2 is public domain.
