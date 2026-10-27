# Demo script: CareShare in ten minutes

Two browser windows side by side: the caregiver's phone (narrow window on `/care`) and the clinic (`/clinic`). Reset demo data from the clinic's Today page before you start.

## 0. Frame it (30 seconds)

"One record, two faces. The family caregiver gets a verified seat on the care team; the rural clinic sees what she knows. Everything you see is synthetic. Identity, Medicare and the EHR are in mock mode; each is a switch away from the real sandbox."

## 1. The gate (2 minutes) — Tamika, caring for Harold Motley

Caregiver window: sign in as Tamika. She is not verified; her last remote attempt failed. Point at the two choices (CLEAR, ID.me) and the in-person fallback. Press Verify with ID.me; the stand-in vendor page appears; choose "verified at IAL2". She lands back verified, and the proxy request is already sent.

Clinic window: Proxy confirmations. Tamika is in the queue. Confirm with "Health care POA on file". Back in the caregiver window, refresh: the whole record opens. Line to land: "She did that once. Not per provider, not on paper, and the clinic chose the consent basis."

## 1b. From nothing (2 minutes) — Regina Shaw, who found the app herself

Caregiver window: press Register. Identity comes first: choose CLEAR (stand-in page), come back verified, then fill in the short "About you" form (with a live vendor, name and date of birth arrive prefilled from the ID). Or pick Regina Shaw under "Caregivers who registered themselves" to skip to the same point. Press "Add the person I care for". "Who are you caring for?" My mother. "Can you get into your mom's Medicare account?" Yes. The authorization, with "which of these is true?" instead of legal categories; type her name, sign. Go to Medicare.gov (stand-in), allow, and come back to "Is this your mom?" with the name, date of birth and coverage Medicare returned. Yes. You land on the medicine list already filled from Part D, each marked from Medicare, to be confirmed. Line to land: "She typed her mother's first name and her own signature. Everything else came from Medicare." Medicines now shows what the pharmacy filled, each marked "from Medicare, unverified", and the diagnosis list is seeded from claims. Line to land: "Nothing was typed twice. The clinic will meet this family with a filled-in chart, not a blank one."

Clinic window: Today now shows one household without a clinical lead. Dr. Pannell (the administrator) opens Admin, assigns Jamal Whitlow, and the household moves onto his list. Later, on the household's Caregiver tab, the clinic confirms Regina as representative; until then the pill says "self-attested".

## 2. The kitchen table (3 minutes) — Denise, caring for Mabel Hairston

Caregiver window: sign in as Denise. Home shows Wednesday's wellness visit with no ride, and the messages. Open Medicines: the clinic wants to check quetiapine (filled under Medicare, not on the list) and lisinopril (listed, not filled since spring). Open Log: record a fall, moderate, "slipped on the porch step". Open My check-in: answer the twelve strain questions; her score goes high.

Clinic window: Today. Mabel is now at the top with a critical fall signal. Open the household: the fall, the ride, the medication discrepancy, and the tier now reads high with weekly cadence because of the check-in. Work it: Medications, add quetiapine from claims, mark reconciliation complete. Visits, arrange the ride. Overview, resolve the fall with "called, no injury, home safety reviewed". Log the call under Contacts with the minutes.

Line to land: "Nothing here needed an EHR integration to be useful on day 90. The EHR is month five."

## 3. The second patient (2 minutes) — Lorraine, caring for Earl Tuck

Clinic window: open Earl Tuck. Five escalations: a fall, urinary symptoms with sudden confusion in the same week (call today), strain at 24 of 48, a missed visit, and Lorraine's own PHQ-2 positive. Caregiver tab: she has no smartphone and no internet, verified in person; her depression screen is routed with one click and the hand-off is recorded, never a diagnosis. Text her a check-in prompt; show it in the Integrations outbox.

Line to land: "Seven in ten of these caregivers have a chronic condition. We measure her too, and route, never diagnose."

## 4. The clinic's month (1.5 minutes)

Household → Monthly summary and documentation: contacts and minutes by stream, check-ins, symptoms, reconciliation, strain and mood. Generate and file. "This is the evidence for whatever the clinic bills after the pilot; during the pilot, nothing is billed through CareShare."

## 4b. The ninety-day re-prompt (30 seconds) — Geneva, caring for Clarence Adkins

Sign in as Geneva. Her authorization was signed 94 days ago and has lapsed, so the record is closed and she is asked to sign again; her own check-in still works. Sign; it reopens. Denise's, signed 83 days ago, shows the amber "lapses in 6 days" banner instead.

## 5. What the pilot reports (1 minute)

Pilot outcomes: People Served (Appendix A only), the three KPOs, every measure with its definition, by locality and by tier. "Every number here recomputes from the record. An evaluator can check it."

## 6. Stop and ask

"Which of these would your care coordinator use next Monday? What did I get wrong about how your clinic works?"

## If the live demo breaks

Every page is server-rendered; a reload fixes most things. Reset demo data from Today. The deck tells the same story.
