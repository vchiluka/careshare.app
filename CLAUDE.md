# CLAUDE.md

Build conventions for anyone (human, Claude Code, Codex) extending CareShare.

## What this is

A Next.js 16 app with two faces over one household record: CareShare Caregiver (family caregiver, verified and delegated) and CareShare Clinic Console (rural primary care clinic). The rules engine under `src/lib/engine/` is the product; pages are a thin server-rendered shell over it. Read `docs/PRD.md` before adding a feature and `docs/INTEGRATIONS.md` before touching `src/lib/integrations/`.

## Non-negotiables

1. **Caregiver access is gated on identity, proxy and consent, in that order.** Nothing from the record renders unless `identity.status === "verified"` at IAL2, **and** `proxy.status` is `confirmed` by clinic staff (or `self_attested` from self-service registration until the clinic confirms), **and** the caregiver's signed authorization (`consents`, 90-day validity) is active. `caregiverAccess()` in `services/household-view.ts` is the one place this is decided. There is no skip path, no demo bypass, no cookie that stands in for any of the three. In-person verification is a staff-attested proofing event, not a shortcut. Use the mock vendor pages for demos. Clinic staff who arrive through CLEAR/ID.me are `pending` until an admin approves them; `requireClinic()` enforces it.
2. **No program dependency.** The tier and cadence structure is adapted from published CMS dementia care-management requirements and is documented as such in `engine/tiering.ts`. Do not add model enrollment, alignment files, or billing logic. The word GUIDE appears only in that citation. Documentation streams in contacts are evidence, not claims.
3. **The platform never diagnoses.** A positive PHQ-2, an elevated blood pressure, a high ZBI are routed with a next step and recorded as routed; they are never stored as a condition. Keep `signals.ts` wording to "screen", "reading", "strain".
4. **Synthetic data only.** Nothing under `data/` may be derived from real people. The seed comes from `scripts/generate-seed.ts` with a fixed PRNG; regenerate, never hand-edit. Real localities are allowed because the pilot plan names them; real organizations are not.
5. **Integrations go through interfaces.** Pages and actions import `getIdentityProvider()`, `getBlueButtonAdapter()`, `getEhrAdapter()`, `getDirectoryAdapter()`, `getSmsAdapter()`, `getRepository()`. A live adapter is a file implementing the existing interface plus an env switch. No vendor SDK outside its adapter file.
6. **Secrets in env, never in code, docs, or the audit trail.** `.env.example` lists every variable with a placeholder; `.env*` is git-ignored; `/clinic/integrations` shows set/missing, never values.
7. **No PHI in logs or the audit trail.** Audit entries carry actor, action, household id, and a reference (vendor subject id, receipt, count). Identity events record assurance evidence (`acr`/`ial`/`aal` values), never tokens or attributes.
8. **Every warning says what to do next.** A `Signal` has `message`, `action`, `owner`. Do not add a signal without all three.

## Stack

- Next.js 16 App Router, React 19, TypeScript strict, Tailwind v4 via `@tailwindcss/turbopack`, vitest, `jose` for OIDC/JWT only.
- Server components and server actions only. `"use client"` only for a leaf that needs browser APIs (none today).
- `cacheComponents` off; pages that read the store export `dynamic = "force-dynamic"`.
- Fonts via `<link>` in the root layout (Atkinson Hyperlegible for body because it is built for low-vision readers; Fraunces for headings). Not `next/font`, which fetches at build and fails offline.
- The two faces share tokens in `globals.css`; `data-face="care"` (larger type, clay accent) and `data-face="clinic"` (denser, slate accent) are set on the face layouts.

## How to add things

- **A new rule:** pure function in `engine/`, doc comment with the clinical source, test in `__tests__`, surface through `computeSignals` or `outcomeReport`; only then a page.
- **A new page:** server component, `force-dynamic`, read through `src/lib/services`, mutate through `src/app/actions.ts` (audit entry required). Use `ui.tsx` components; no component library.
- **A live adapter:** implement the interface in `<vendor>.ts`, read config from env, register in the `get*()` switch, document variables in `.env.example`, `docs/INTEGRATIONS.md`, and `/clinic/integrations`. Keep the mock working.
- **The store:** three drivers behind `Repository`: memory (default for `npm run dev`), `blob.ts` (Vercel Blob, used when `BLOB_READ_WRITE_TOKEN` is set; production today), `postgres.ts` (Neon, used when `DATABASE_URL` is set; takes precedence). Any new document kind goes through `Repository` so all three stay equivalent; `__tests__/blob.test.ts` exercises the blob driver with a mocked SDK.
- **Education content:** `src/lib/content/education.ts`, paraphrased from public-domain guidance with the source named; no verbatim copying.

## Commands

```
npm run dev   npm test   npm run lint   npm run build   npm run seed
```

Before committing: `npm test && npm run lint && npm run build` must pass.

## Style

Plain, specific language. The caregiver face is written for someone tired, on a phone, at night: short sentences, no jargon, numbers with units, phone numbers tappable. The clinic face uses the words a rural clinic uses (household, caregiver, representative, escalation, cadence, reconciliation). No marketing copy, no exclamation marks.
