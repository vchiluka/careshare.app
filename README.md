# CareShare

One shared record for the family caring for someone with dementia, and the rural primary care clinic that cares for them both.

CareShare is one platform with two faces:

- **CareShare Caregiver** (the consumer-facing side): the family caregiver verifies her identity to the federal standard (CLEAR or ID.me at NIST IAL2/AAL2, with in-person verification at the clinic as the rural fallback), the clinic confirms her once as the patient's representative, and she gets a shared care plan, one medication list checked against Medicare pharmacy claims, a symptom log, visits and rides, secure messages, check-ins on her own health (Zarit short form, PHQ-2, home blood pressure, her own primary care visit), and the community resources listed for her county with a closed loop back to the directory.
- **CareShare Clinic Console** (the provider side): for a rural FQHC, RHC or practice, with no special program enrollment. Roster by tier and contact cadence, proxy confirmation queue, escalation queue driven by what the caregiver logs, medication reconciliation against Medicare claims, monthly structured summary, documentation export, and a pilot outcomes dashboard with every measure computed from the record by Appendix A locality.

The care-plan structure (stage, caregiver, burden; tier sets cadence) is adapted from the dementia care-management requirements CMS published for its GUIDE model. Nothing in CareShare enrolls anyone in a CMS model or bills anything.

This build is the baseline for Vivid Solutions' application to Virginia's Rural Health Transformation Program (CareIQ Tech Innovation Fund, RFA C-27-002): a consumer-facing health technology for a defined chronic disease, deployable in named rural localities within 90 days, with the trust layer already working.

**Everything in the data is synthetic.** People, clinics, phone numbers and directory listings are invented. The localities (Danville, Pittsylvania, Halifax, Henry, Martinsville, Mecklenburg; Eastern Shore and Southern Piedmont as later phases) are real because the pilot plan names them.

## Run it

```
npm install
npm run dev        # http://localhost:3000, mock mode for every integration
npm test           # rules engine tests (vitest)
npm run lint
npm run build      # regenerates the seed first
```

Open `/care` and pick a caregiver, or `/clinic` and pick a staff role. The demo clock is `DEMO_AS_OF` (default 2026-10-24).

## Layout

```
src/lib/domain/types.ts        the household model (patient, caregivers, identity, proxy, plan, meds, logs, referrals, escalations)
src/lib/engine/                pure rules: tiering, cadence, signals, reconciliation, outcomes, monthly summary (tests in __tests__)
src/lib/integrations/          identity (mock + OIDC for CLEAR/ID.me), bluebutton, fhir, directory, sms — interface + mock + live, env-switched
src/lib/store/                 Repository interface; memory driver over the synthetic seed
src/lib/services/              read models for pages
src/app/actions.ts             every mutation, each with an audit entry
src/app/care/*                 CareShare Caregiver
src/app/clinic/*               CareShare Clinic Console
src/app/api/*/callback         OIDC and Blue Button redirect URIs
src/app/mock/*                 stand-in vendor pages used in mock mode
scripts/generate-seed.ts       deterministic synthetic data → data/seed/seed.json
docs/                          PRD, integrations, demo script
```

## Going live, one switch at a time

Every seam is an environment variable; `/clinic/integrations` shows the current mode and what each needs. Secrets live in the environment (Vercel project settings, or `.env.local`), never in code or docs. See `.env.example` and `docs/INTEGRATIONS.md`.

## Deploy

Vercel, Node runtime. Set `CARESHARE_SECRET` (required in production) and `DEMO_AS_OF`. Without a database the memory store resets with each deployment. To persist: in the Vercel project, Storage → Create Database → Neon; Vercel injects `DATABASE_URL` and the Postgres driver takes over on the next deploy, creating its tables and loading the seed on first request.
