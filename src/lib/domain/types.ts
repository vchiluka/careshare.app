/**
 * CareShare domain model.
 *
 * One platform, two faces:
 *   - CareShare Caregiver: the family caregiver's verified, delegated seat on the care team.
 *   - CareShare Clinic Console: the rural primary care clinic's view of the same household.
 *
 * The unit of care is the household: one person living with dementia (the patient) and the
 * family caregivers around them. Nothing here depends on any CMS model enrollment; the care-plan
 * structure is adapted from published dementia care-management requirements (see engine/tiering.ts).
 *
 * Every record is synthetic. See scripts/generate-seed.ts.
 */

export type ISODate = string; // YYYY-MM-DD
export type ISODateTime = string;

// ---------- Geography and sites ----------

export type Region = "southside" | "eastern_shore" | "southern_piedmont";

export interface Locality {
  fips: string;
  name: string; // "Pittsylvania County", "Danville City"
  region: Region;
  /** Appendix A of RFA C-27-002 lists the 76 rural localities that count toward metrics. */
  appendixA: boolean;
  /** Phase in the pilot plan: 1 = go-live, 2 = month four, 3 = if capacity allows, 0 = not in pilot. */
  pilotPhase: 0 | 1 | 2 | 3;
}

export type StaffRole = "physician" | "np_pa" | "rn" | "ma" | "coordinator" | "ot" | "behavioral_health" | "admin";

/** Roles that may be assigned as the clinical lead for a household. */
export const CLINICAL_LEAD_ROLES: StaffRole[] = ["physician", "np_pa", "rn"];

export interface StaffUser {
  id: string;
  name: string;
  role: StaffRole;
  siteId: string;
  credentials?: string;
  /** May approve staff, assign clinical leads, manage sites. */
  isAdmin?: boolean;
  /** pending = verified with CLEAR/ID.me but not yet approved by an admin; sees nothing. */
  status: "active" | "pending" | "disabled";
  /** Identity proofing when the person signed in through a CSP rather than the demo picker. */
  identity?: { provider: "clear" | "idme"; subject: string; assurance: "IAL1" | "IAL2"; verifiedOn: ISODate };
  email?: string;
  approvedBy?: string;
  approvedOn?: ISODate;
}

export interface ClinicSite {
  id: string;
  name: string;
  orgName: string;
  type: "FQHC" | "RHC" | "free_clinic" | "practice";
  localityFips: string;
  town: string;
  phone: string;
  ehrVendor?: string;
}

// ---------- People ----------

export interface Diagnosis {
  code: string; // ICD-10-CM
  display: string;
  onset?: ISODate;
}

export interface Patient {
  id: string;
  givenName: string;
  familyName: string;
  birthDate: ISODate;
  sex: "F" | "M";
  /** Synthetic Medicare Beneficiary Identifier, format-valid only. */
  mbi: string;
  coverage: { partA: boolean; partB: boolean; partC: boolean; partD: boolean; medicaid: boolean };
  residence: "own_home" | "family_home" | "assisted_living";
  localityFips: string;
  diagnoses: Diagnosis[];
  /** EHR patient id at the partner clinic, if linked. */
  ehrPatientId?: string;
  /** What the caregiver calls them ("mom"); used for voice in the caregiver face. */
  term?: CareTerm;
  phone?: string;
}

export type CaregiverRelationship = "spouse" | "daughter" | "son" | "child" | "daughter_in_law" | "sibling" | "grandchild" | "friend_neighbor" | "other";

/**
 * How the caregiver refers to the person ("my mother"). Sets the app's voice during setup
 * ("your mom's medicines") and maps to a relationship and, when it implies one, a sex.
 */
export type CareTerm = "mother" | "father" | "wife" | "husband" | "parent_in_law" | "sibling" | "grandparent" | "friend" | "other";

/** Self-service add-patient flow in progress; lives on the account until the household is created. */
export interface AddPatientDraft {
  startedAt: ISODateTime;
  term?: CareTerm;
  patientFirstName?: string;
  livesWith?: boolean;
  localityFips?: string;
  /** How the caregiver will get the Medicare data: she has the login; card but no account yet; no Medicare. */
  route?: "login" | "card" | "none";
  consent?: { basis: ConsentBasis; typedSignature: string; patientSignature?: string; signedAt: ISODateTime; shareDirectory: boolean; shareEvaluator: boolean; attestedFrom?: string };
  /** What Medicare returned, held until the caregiver confirms it is the right person. */
  import?: MedicareImport;
  /** Typed details, for the no-Medicare route. */
  details?: { givenName: string; familyName: string; birthDate: ISODate; sex: "F" | "M"; coverage: "medicare" | "medicare_advantage" | "other" | "none" };
}

export type IdentityStatus = "not_started" | "pending" | "verified" | "failed" | "in_person_pending";

export interface CaregiverIdentity {
  status: IdentityStatus;
  provider?: "idme" | "clear" | "in_person";
  assurance?: "IAL1" | "IAL2";
  authenticator?: "AAL1" | "AAL2";
  verifiedOn?: ISODate;
  /** Provider's stable subject id. Never store document images or raw attributes. */
  subject?: string;
  failureReason?: string;
  attempts: number;
}

/**
 * not_requested → requested → confirmed (by clinic staff) | revoked.
 * self_attested: the caregiver signed the authorization form herself after identity proofing (self-service
 * registration). It opens her own view of what she and Medicare supplied; clinic confirmation upgrades it.
 */
export type ProxyStatus = "not_requested" | "requested" | "self_attested" | "confirmed" | "revoked";

export type ProxyScope = "care_plan" | "medications" | "appointments" | "messages" | "medicare_records" | "symptom_log";

export interface ProxyRelationship {
  status: ProxyStatus;
  /** The patient's (or their legal representative's) consent, recorded by the clinic. */
  consentRecordedOn?: ISODate;
  consentBasis?: "patient" | "poa_healthcare" | "legal_guardian";
  requestedOn?: ISODate;
  confirmedOn?: ISODate;
  confirmedBy?: string; // staff id
  revokedOn?: ISODate;
  scope: ProxyScope[];
}

export interface Phq2Entry {
  date: ISODate;
  items: [number, number]; // 0-3 each
  total: number; // 0-6; >= 3 is a positive screen
  routedOn?: ISODate; // when the clinic routed the caregiver to her own provider
}

export interface BpReading {
  date: ISODate;
  systolic: number;
  diastolic: number;
  source: "home_cuff" | "clinic";
}

export interface Zbi12Entry {
  date: ISODate;
  items: number[]; // 12 items, 0-4 each
  total: number; // 0-48
  context: "baseline" | "check_in" | "clinic";
}

export interface CaregiverHealth {
  phq2: Phq2Entry[];
  bp: BpReading[];
  zbi: Zbi12Entry[];
  /** The caregiver's own primary care. Who she sees is her business; we track only dates. */
  ownPcpLastVisit?: ISODate;
  ownPcpNextScheduled?: ISODate;
  hasHomeBpCuff: boolean;
}

export interface Caregiver {
  id: string;
  givenName: string;
  familyName: string;
  birthDate: ISODate;
  relationship: CaregiverRelationship;
  livesWithPatient: boolean;
  localityFips: string;
  phone: string;
  /** How she can reach us and how we reach her. Rural modifications depend on this. */
  access: { smartphone: boolean; broadband: "ok" | "low" | "none"; preferredChannel: "app" | "sms" | "phone" };
  isPrimary: boolean;
  identity: CaregiverIdentity;
  proxy: ProxyRelationship;
  health: CaregiverHealth;
  hoursPerWeek: number;
  email?: string;
  /** Set when this caregiver came through self-service registration. */
  accountId?: string;
}

/**
 * A caregiver who registered herself, before (or independent of) any household. Identity proofing
 * happens here; adding a patient copies the account into a Household.caregivers entry and links back.
 */
export interface CaregiverAccount {
  id: string;
  givenName: string;
  familyName: string;
  birthDate: ISODate;
  phone: string;
  email?: string;
  localityFips: string;
  access: Caregiver["access"];
  identity: CaregiverIdentity;
  registeredOn: ISODate;
  householdIds: string[];
  pending?: AddPatientDraft;
}

export type ConsentBasis = "patient" | "poa_healthcare" | "legal_guardian";

/** The signed authorization to access and share health information. Re-affirmed every 90 days. */
export interface ConsentRecord {
  id: string;
  caregiverId: string;
  version: string; // form version, e.g. "2026-10"
  basis: ConsentBasis;
  typedSignature: string;
  signedAt: ISODateTime;
  expiresOn: ISODate;
  scopes: ProxyScope[];
  /** What the caregiver agreed may be shared: the clinic always; others opt-in. */
  shareWith: { clinic: true; directoryPartner: boolean; evaluator: boolean };
  status: "active" | "expired" | "revoked" | "superseded";
  revokedAt?: ISODateTime;
  /** Request fingerprint for the audit trail: truncated IP and user agent family, no more. */
  attestedFrom?: string;
  /** When the basis is the patient's own consent and she can sign: her typed name, co-signed on the same form. */
  patientSignature?: string;
}

/**
 * A time-limited link to a FHIR R4 bundle of the record (care plan, medicines, consent, latest summary), for
 * a provider the family reaches who is not on the platform: the memory clinic, the ED, adult day. Modeled on
 * SMART Health Links (viewer URL, expiry, PIN); the secret and PIN are stored hashed. Every open is audited.
 */
export interface ShareLink {
  id: string;
  /** SHA-256 of the URL secret. */
  tokenHash: string;
  /** SHA-256 of the 6-digit PIN. */
  pinHash: string;
  label: string;
  createdBy: string; // caregiver id
  createdAt: ISODateTime;
  expiresAt: ISODateTime;
  revokedAt?: ISODateTime;
  opens: number;
  lastOpenedAt?: ISODateTime;
}

/** A second caregiver joins with a code after verifying her own identity; the code is single-use. */
export interface CaregiverInvite {
  code: string;
  givenName: string;
  relationship: CaregiverRelationship;
  createdBy: string; // caregiver id
  createdAt: ISODateTime;
  expiresAt: ISODateTime;
  usedBy?: string; // account id
  usedAt?: ISODateTime;
}

export const CONSENT_VALID_DAYS = 90;
export const CONSENT_FORM_VERSION = "2026-10";

// ---------- Clinical content ----------

export type CdrGlobal = 0 | 0.5 | 1 | 2 | 3;
export type FastStage = "1" | "2" | "3" | "4" | "5" | "6a" | "6b" | "6c" | "6d" | "6e" | "7a" | "7b" | "7c" | "7d" | "7e" | "7f";

export interface Staging {
  cdrGlobal?: CdrGlobal;
  fast?: FastStage;
  assessedOn: ISODate;
  assessedBy: string; // staff id
  /** Neuropsychiatric Inventory Questionnaire severity total (0-36), when recorded. */
  npiqSeverity?: number;
}

export type CareTier =
  | "LOW_DYAD" // mild dementia, caregiver present
  | "MODERATE_DYAD" // moderate/severe, caregiver present, burden below threshold
  | "HIGH_DYAD" // moderate/severe, caregiver present, high burden
  | "LOW_INDIVIDUAL" // mild, no caregiver
  | "MOD_HIGH_INDIVIDUAL"; // moderate/severe, no caregiver

export interface CareGoal {
  id: string;
  text: string;
  owner: "caregiver" | "clinic" | "shared";
  status: "active" | "met" | "dropped";
  dueOn?: ISODate;
}

export interface CarePlan {
  tier: CareTier | null;
  tierSetOn?: ISODate;
  contactCadenceDays: number;
  goals: CareGoal[];
  /** Plain-language plan the caregiver sees: what to watch for, who to call, respite arrangements. */
  watchFor: string[];
  whoToCall: { label: string; phone: string }[];
  respiteArrangement?: string;
  reviewedOn?: ISODate;
  reviewedBy?: string;
}

export type MedSource = "clinic" | "medicare" | "caregiver";

export interface Medication {
  id: string;
  name: string; // generic
  strength: string;
  sig: string;
  source: MedSource;
  status: "active" | "stopped" | "unverified";
  prescriber?: string;
  /** Most recent pharmacy fill seen in Medicare Part D claims, when connected. */
  lastFillOn?: ISODate;
  daysSupply?: number;
  /** National Drug Code from the claim, when the source is Medicare. */
  ndc?: string;
  note?: string;
}

export type SymptomKind = "fall" | "confusion" | "behavior" | "sleep" | "appetite" | "pain" | "urinary" | "mood" | "wandering" | "other";

export interface SymptomEntry {
  id: string;
  date: ISODate;
  kind: SymptomKind;
  severity: 1 | 2 | 3; // 1 mild, 2 moderate, 3 severe
  note: string;
  reportedBy: string; // caregiver id
}

export type AppointmentPurpose = "annual_wellness" | "cognitive_assessment" | "follow_up" | "specialist" | "lab" | "behavioral_health" | "caregiver_own_visit";

export interface Appointment {
  id: string;
  date: ISODate;
  time?: string;
  purpose: AppointmentPurpose;
  withName: string;
  location: string;
  status: "scheduled" | "completed" | "missed" | "cancelled";
  /** For the patient's visits: whether the caregiver needs a ride arranged. */
  transport: { needed: boolean; arranged: boolean; provider?: string };
  /** Who the visit is for. Caregiver-own visits are the caregiver's health, tracked by date only. */
  forPerson: "patient" | "caregiver";
}

export interface Message {
  id: string;
  at: ISODateTime;
  from: "caregiver" | "clinic";
  authorId: string;
  authorName: string;
  body: string;
  readAt?: ISODateTime;
}

export type ContactKind = "phone" | "video" | "in_person" | "secure_message" | "caregiver_group" | "home_visit";

export interface ContactEvent {
  id: string;
  date: ISODate;
  kind: ContactKind;
  byStaffId: string;
  minutes: number;
  summary: string;
  /** Which documentation stream this time supports after the pilot. Informational only. */
  supports: ("care_management" | "caregiver_training" | "cognitive_assessment")[];
}

export type ResourceCategory = "respite" | "adult_day" | "transport" | "meals" | "caregiver_support" | "home_care" | "legal_financial" | "memory_cafe" | "behavioral_health";

export interface CommunityResource {
  id: string;
  name: string;
  category: ResourceCategory;
  localityFips: string[]; // served
  phone: string;
  summary: string;
  /** Directory of record. In production this is the VirginiaNavigator listing id and deep link. */
  directory: { source: "virginianavigator_mock"; listingId: string; url: string };
}

export type ReferralStatus = "suggested" | "contacted" | "enrolled" | "declined" | "not_reached" | "closed";

export interface Referral {
  id: string;
  resourceId: string;
  suggestedOn: ISODate;
  suggestedBy: "caregiver" | "clinic" | "directory";
  status: ReferralStatus;
  updatedOn: ISODate;
  outcomeNote?: string;
  /** Closed loop: when the outcome was reported back to the directory partner (consented, de-identified). */
  reportedBackOn?: ISODate;
}

export type EscalationRule =
  | "FALL_REPORTED"
  | "UTI_SIGNS"
  | "BEHAVIOR_CRISIS"
  | "WANDERING"
  | "PHQ2_POSITIVE"
  | "BP_CRISIS"
  | "BP_ELEVATED"
  | "BURDEN_HIGH"
  | "BURDEN_RISING"
  | "MED_DISCREPANCY"
  | "CADENCE_OVERDUE"
  | "MISSED_APPOINTMENT"
  | "TRANSPORT_UNARRANGED"
  | "ED_VISIT_FOLLOW_UP"
  | "PROXY_NOT_CONFIRMED"
  | "IDENTITY_NOT_VERIFIED"
  | "AWV_OVERDUE"
  | "COGNITIVE_ASSESSMENT_DUE"
  | "CAREGIVER_OWN_VISIT_OVERDUE"
  | "ZBI_BASELINE_DUE"
  | "ZBI_FOLLOWUP_DUE"
  | "STAGING_CONFLICT"
  | "HOSPICE_THRESHOLD";

export type Severity = "critical" | "warning" | "info";

export interface Signal {
  rule: EscalationRule;
  severity: Severity;
  message: string;
  /** What to do next. Every warning says what to do next. */
  action: string;
  /** Who should act. */
  owner: "clinic" | "caregiver" | "both";
  /** Stable key so the same signal is not recorded twice. */
  key: string;
  evidenceDate?: ISODate;
}

export interface Escalation extends Signal {
  id: string;
  raisedOn: ISODate;
  status: "open" | "acknowledged" | "resolved";
  /** Hidden from the queue until this date; the rule still runs and re-raises after. Alert-fatigue control. */
  snoozedUntil?: ISODate;
  snoozedBy?: string;
  acknowledgedBy?: string;
  acknowledgedOn?: ISODate;
  resolvedOn?: ISODate;
  resolvedBy?: string;
  resolution?: string;
}

export interface EdVisit {
  date: ISODate;
  reason: string;
  source: "partner_reported" | "caregiver_reported" | "medicare_claim";
  admitted: boolean;
}

export interface MedicareConnection {
  connected: boolean;
  connectedOn?: ISODate;
  lastSyncOn?: ISODate;
  mode?: "mock" | "live";
  /** Who authorized: the beneficiary, or a verified caregiver acting as representative. */
  authorizedBy?: "patient" | "representative";
  /** Blue Button FHIR Patient id (not the MBI). */
  patientRef?: string;
}

// ---------- Medicare data as Blue Button 2.0 returns it (FHIR R4, normalized) ----------

export interface BbCoding {
  system?: string;
  code: string;
  display?: string;
}

/** FHIR Patient from Blue Button (demographics only; identifiers reduced to the BB patient id). */
export interface BbPatient {
  id: string;
  givenName?: string;
  familyName?: string;
  birthDate?: ISODate;
  gender?: "male" | "female" | "other" | "unknown";
  deceasedDate?: ISODate;
  address?: { state?: string; postalCode?: string; county?: string };
  /** Race / ethnicity extensions are intentionally not stored. */
}

export type BbCoverageType = "Part A" | "Part B" | "Part C" | "Part D" | "Unknown";

/** FHIR Coverage from Blue Button: one per part, with CMS extensions summarized. */
export interface BbCoverage {
  id: string;
  type: BbCoverageType;
  status: "active" | "cancelled" | "draft" | "entered-in-error";
  periodStart?: ISODate;
  periodEnd?: ISODate;
  payor?: string;
  /** Monthly dual-eligibility code from the coverage extensions (e.g. "02" full dual); "00"/"NA" = none. */
  dualCode?: string;
  /** Medicare status code (aged, disabled, ESRD) when present. */
  medicareStatusCode?: string;
  /** Part D: low-income subsidy and plan contract/PBP when present. */
  partDContract?: string;
  partDPbp?: string;
  lowIncomeSubsidy?: string;
  /** Part C: MA plan contract when present. */
  partCContract?: string;
}

export type BbEobType = "pde" | "carrier" | "dme" | "inpatient" | "outpatient" | "snf" | "hha" | "hospice" | "unknown";

export interface BbEobItem {
  sequence: number;
  productOrService?: BbCoding; // NDC for PDE, HCPCS/CPT for Part B
  servicedDate?: ISODate;
  servicedEnd?: ISODate;
  quantity?: number;
  /** Adjudication amounts, in dollars, by category code (e.g. "submitted", "benefit", "paidtopatient"). */
  amounts: Record<string, number>;
  locationCode?: string;
}

/** FHIR ExplanationOfBenefit from Blue Button, reduced to what care coordination uses. */
export interface BbEob {
  id: string;
  type: BbEobType;
  status?: string;
  billablePeriodStart?: ISODate;
  billablePeriodEnd?: ISODate;
  /** Attending / prescribing / rendering provider as NPI + display when present. */
  provider?: { npi?: string; display?: string };
  facility?: { display?: string; typeCode?: string };
  diagnoses: { sequence: number; coding: BbCoding; type?: string }[]; // ICD-10-CM
  procedures: { sequence: number; coding: BbCoding; date?: ISODate }[];
  items: BbEobItem[];
  /** PDE only: days supply, fill number, pharmacy, prescriber. */
  pharmacy?: { daysSupply?: number; fillNumber?: number; pharmacyNpi?: string; prescriberNpi?: string; brandGeneric?: string };
  totals: Record<string, number>; // e.g. submitted, benefit, paidbypatient
}

export interface MedicareImport {
  pulledOn: ISODate;
  source: "mock" | "live";
  baseUrl?: string;
  patient?: BbPatient;
  coverages: BbCoverage[];
  eobs: BbEob[];
  /** Counts for the summary line and the integrations page. */
  counts: { coverages: number; eobs: number; pde: number; carrier: number; institutional: number };
}

export interface MonthlySummary {
  month: string; // YYYY-MM
  generatedOn: ISODate;
  tier: CareTier | null;
  contacts: number;
  contactMinutes: number;
  caregiverCheckIns: number;
  symptomsLogged: number;
  fallsLogged: number;
  openEscalations: number;
  medReconciliationCompleted: boolean;
  zbiTotal?: number;
  phq2Total?: number;
  notes: string;
}

export type HouseholdStatus = "invited" | "enrolling" | "active" | "paused" | "closed";

export interface Household {
  id: string;
  /** Site the household is assigned to. Self-registered households start at the site for their locality. */
  siteId: string;
  /** Staff id of the clinical lead (physician, NP/PA or RN). Unassigned until an admin assigns one. */
  assignedLeadStaffId?: string;
  assignedOn?: ISODate;
  origin: "clinic_enrolled" | "self_registered";
  patient: Patient;
  caregivers: Caregiver[];
  consents: ConsentRecord[];
  /** "Share with a provider" links the caregiver created: time-limited, PIN-protected, audited. */
  shares?: ShareLink[];
  /** Invitations for a second caregiver to join through her own verified account. */
  invites?: CaregiverInvite[];
  status: HouseholdStatus;
  enrolledOn?: ISODate;
  referralSource: "clinic" | "directory" | "aaa" | "hospital_discharge" | "self";
  staging?: Staging;
  carePlan: CarePlan;
  medications: Medication[];
  /** Medicare Part D fills as pulled from claims; drives reconciliation against the clinic list. */
  medicareFills: { ndc: string; name: string; strength: string; fillOn: ISODate; daysSupply: number }[];
  medicare: MedicareConnection;
  /** Everything Blue Button returned, normalized. medicareFills is derived from its PDE claims. */
  medicareImport?: MedicareImport;
  medReconciliationCompletedOn?: ISODate;
  symptomLog: SymptomEntry[];
  appointments: Appointment[];
  messages: Message[];
  contacts: ContactEvent[];
  referrals: Referral[];
  escalations: Escalation[];
  edVisits: EdVisit[];
  summaries: MonthlySummary[];
  lastCognitiveAssessmentOn?: ISODate; // 99483-style assessment and care planning visit
  lastAnnualWellnessOn?: ISODate;
}

export interface AuditEntry {
  id: string;
  at: ISODateTime;
  actor: string; // "caregiver:<id>", "staff:<id>", "system"
  action: string;
  householdId?: string;
  reference?: string;
  /** No clinical content. Ids and outcomes only. */
  detail?: string;
}

export type EducationTopic = "understanding_dementia" | "daily_care" | "behaviors" | "safety" | "medications" | "caregiver_health" | "medicare_medicaid" | "planning_ahead" | "respite";

export interface EducationItem {
  id: string;
  topic: EducationTopic;
  title: string;
  summary: string;
  /** Short plain-language body, paragraphs separated by blank lines. */
  body: string;
  minutes: number;
  /** FAST stages it is most useful for; empty = all. */
  stages: FastStage[];
  /** Source the content is adapted from, for the footer. */
  source: string;
}

export interface SeedData {
  generatedOn: ISODate;
  asOf: ISODate;
  localities: Locality[];
  sites: ClinicSite[];
  staff: StaffUser[];
  resources: CommunityResource[];
  education: EducationItem[];
  accounts: CaregiverAccount[];
  households: Household[];
}
