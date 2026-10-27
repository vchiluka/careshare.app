# Integrations

Every external system sits behind an interface with a mock. Selection is by environment variable; `/clinic/integrations` shows the current mode and which variables are set (never their values).

| Seam | Switch | Values | Interface | Live file |
| --- | --- | --- | --- | --- |
| Store | `STORE_DRIVER` | `memory` (default), `postgres` | `src/lib/store/repository.ts` | `postgres.ts` (to write) |
| CLEAR | `IDENTITY_CLEAR` | `mock`, `live` | `src/lib/integrations/identity/types.ts` | `identity/oidc.ts` |
| ID.me | `IDENTITY_IDME` | `mock`, `live` | same | same |
| Blue Button 2.0 | `BLUEBUTTON_ADAPTER` | `mock`, `live` | `bluebutton/types.ts` | `bluebutton/live.ts` |
| EHR | `EHR_ADAPTER` | `mock`, `generic-fhir` | `fhir/index.ts` | same file |
| Directory | `DIRECTORY_ADAPTER` | `mock`, `virginianavigator` | `directory/index.ts` | same file (contract pending) |
| SMS | `SMS_ADAPTER` | `mock`, `twilio` | `sms/index.ts` | same file |

Unknown values throw at first use with a message naming the fix.

## 1. Identity proofing: CLEAR and ID.me (sandboxes available now)

Target: NIST SP 800-63-3 IAL2 identity proofing and AAL2 authentication. One OIDC implementation (`identity/oidc.ts`) serves both vendors; everything vendor-specific is configuration.

**Flow.** `start()` builds the authorize URL (response_type=code, PKCE S256, state, nonce, scopes, optional acr_values) and returns a session the server action stores in a signed HTTP-only cookie. The vendor redirects to `/api/identity/callback/{idme|clear}`; the route handler takes the cookie, exchanges the code (client_secret_post by default), verifies the ID token against the vendor's JWKS (issuer, audience, nonce, expiry), optionally calls userinfo, maps assurance, and updates the caregiver. On success at IAL2 the caregiver's proxy is automatically set to `requested` so the clinic's queue picks it up.

**Assurance mapping.** Neither vendor returns NIST `acr`/`ial`/`aal` claims. `<P>_ASSURANCE_MODE=scope` (default) records IAL2/AAL2 when the vendor enforced an IAL2 policy before issuing tokens: for ID.me that is a successful exchange under an IAL2 policy handle in the scope (`nist_aal2_ial2`); for CLEAR Verified, an IAL2 proofing service, a token with `verification_status` success (or no status claim). The evidence string in the audit entry keeps whatever the token carried (`verification_status`, `verification_is_sandbox`, `amr`, scopes). `claims` mode ignores both shortcuts and requires explicit IAL2 claims, which today locks everyone out; use it only if a vendor starts emitting them.

**To turn on the ID.me sandbox** (Vercel → Project → Settings → Environment Variables; never paste values into chat or commit them):

```
IDENTITY_IDME=live
IDME_CLIENT_ID=…            from the ID.me developer console
IDME_CLIENT_SECRET=…
IDME_REDIRECT_URI=https://<your-host>/api/identity/callback/idme   (ID.me adds it to both environments; no dynamic URLs)
IDME_ISSUER=https://api.idmelabs.com/oidc      (production: https://api.id.me/oidc)
IDME_SCOPES=openid nist_aal2_ial2              ("openid <policy handle>"; the handle is shown on your app in the ID.me console)
```

ID.me facts the adapter relies on (docs.id.me): sandbox host `api.idmelabs.com`, issuer `https://api.idmelabs.com/oidc`, discovery at the host root (`/.well-known/openid-configuration`, the adapter tries the issuer path first and falls back to the root), JWKS `/oidc/.well-known/jwks`, authorize `/oauth/authorize`, token `/oauth/token` (code + PKCE S256, `client_secret` in the form body), userinfo `/api/public/v3/userinfo` returning a signed JWT (the adapter decodes it). ID token claims are `fname`, `lname`, `birth_date` plus `sub`; no `acr`. Sandbox has test identities and no PII; production has no test identities.

**To turn on the CLEAR sandbox:**

```
IDENTITY_CLEAR=live
CLEAR_CLIENT_ID=…            from the CLEAR console (choose the sandbox environment when creating the client)
CLEAR_CLIENT_SECRET=…
CLEAR_REDIRECT_URI=https://<your-host>/api/identity/callback/clear   (add to the client's redirect allowlist)
```

That is all CLEAR needs. CLEAR Verified publishes fixed endpoints and no discovery document, so the adapter defaults to issuer `https://verified.clearme.com/integrations`, authorize `.../oauth2/auth`, token `.../oauth2/token`, JWKS `.../.well-known/jwks.json`, scope `openid`, PKCE S256, `client_secret_post` (docs.clearme.com, "OAuth 2.0 and OIDC"). Sandbox and production share the host; sandbox tokens carry `verification_is_sandbox: true`. The identity token is only issued when CLEAR validated the person's demographics, and carries `verification_id`, `amr` (for example `selfie`), `given_name`, `family_name`, `birthdate`. Override any endpoint with `CLEAR_ISSUER`, `CLEAR_AUTHORIZATION_ENDPOINT`, `CLEAR_TOKEN_ENDPOINT`, `CLEAR_JWKS_URI`, `CLEAR_USERINFO_ENDPOINT` if CLEAR gives you different values. Redeploy after changing variables. Then open a caregiver whose status is not verified and press Verify; the mock page is replaced by the vendor.

**What is stored.** Provider, subject id, assurance levels, date. Never attributes beyond a one-time name/DOB match, never document images, never tokens. The audit entry records the subject reference and assurance evidence.

## 2. Blue Button 2.0

OAuth 2.0 authorization code with PKCE against `sandbox.bluebutton.cms.gov` (synthetic beneficiaries) or production. The person consents on Medicare.gov. Redirect URI `/api/medicare/callback`. At the callback the adapter pulls `Patient`, `Coverage` and every `ExplanationOfBenefit` (paginated, `BB_MAX_PAGES`), maps them through `bluebutton/fhir.ts` into `MedicareImport` (CARIN BB shapes: coverage parts and dual-eligibility codes from the `dual_01..12` extensions, EOB type from the `type` coding, diagnoses, procedures, line items with adjudication amounts, Part D fills with NDC, days supply and refill number), writes it to the household via `services/medicare-apply.ts`, and discards the token. Apply rules: fills refresh the reconciliation list and coverage flags always; when the household has no clinic-entered diagnoses or medications (self-registered), the import seeds them, marked `source: "medicare"` / `status: "unverified"` so the clinic confirms or stops each one. Refresh tokens and a monthly re-pull need the encrypted token table.

The mock (`bluebutton/synthetic.ts`) emits the same FHIR R4 resources the sandbox returns for a household (deterministic by household id), so the mapper and the apply rules are the code that will run live; only the transport changes. Registering a sandbox app takes a CMS developer account and about ten minutes; set the four `BB_*` variables and `BLUEBUTTON_ADAPTER=live`.

Env: `BLUEBUTTON_ADAPTER=live`, `BB_CLIENT_ID`, `BB_CLIENT_SECRET`, `BB_REDIRECT_URI`, `BB_BASE_URL` (default sandbox), `BB_SCOPES`.

Representative access: today a caregiver authorizes by signing in as the beneficiary's representative on Medicare.gov; the personal-representative rules for third-party apps are still being settled by CMS. The adapter records `authorizedBy`.

## 3. EHR (FHIR R4)

`generic-fhir` targets any certified R4 server with SMART Backend Services: client_credentials with an RS384 `private_key_jwt` assertion, discovery at `/.well-known/smart-configuration`. Operations: patient match by name and birth date, active Conditions, Encounters since a date, write CarePlan, write DocumentReference (the monthly summary). The partner clinic's vendor decides whether a vendor-specific adapter (Epic, athenahealth, eClinicalWorks) is needed for write scopes; the interface does not change.

Env: `EHR_ADAPTER=generic-fhir`, `FHIR_BASE_URL`, `FHIR_CLIENT_ID`, `FHIR_PRIVATE_KEY_PEM`, `FHIR_KEY_ID`, `FHIR_SCOPES`.

## 4. Community directory

Mock listings carry VirginiaNavigator-style listing ids and county coverage. The live adapter is a stub until a data-feed or API agreement exists; `reportOutcome()` posts listing id, locality, category and outcome status only (no PHI), which is the closed loop the directory partner lacks today.

## 5. SMS

Mock writes to an in-memory outbox shown on `/clinic/integrations`. Twilio adapter sends via the REST API. Bodies carry no clinical content; links point to the gated app.

## 6. Persistent store

`store/postgres.ts` runs on Neon serverless Postgres (`@neondatabase/serverless`, HTTP driver, no pool to manage on Vercel). Three tables: `cs_documents(kind, id, data jsonb)` for households, staff and caregiver accounts; `cs_audit` append-only; `cs_meta`. Reference data (localities, sites, resources, education) comes from the seed file. On first request with an empty database the driver creates the tables and loads the seed; `Reset demo data` wipes and reseeds. Selection is automatic: `DATABASE_URL` set → postgres, else memory; `STORE_DRIVER` overrides. Create the database from the Vercel project (Storage → Create Database → Neon); Vercel injects `DATABASE_URL`. Encrypted token storage for Blue Button refresh tokens is the next addition.

## 7. Staff sign-in through a CSP

Clinic staff use the same CLEAR / ID.me integration as caregivers (`subject.kind = "staff"` in the proofing session). A new subject creates a `StaffUser` with `status: "pending"` and no role beyond `ma`; the pending page is all they can reach until an administrator approves them on `/clinic/admin`, setting role, site and admin flag. Returning subjects are matched on the CSP subject id. The demo role picker stays for the walkthrough and is replaced by the clinic's SSO (or CSP-only sign-in) in production.

## Order of work

1. CLEAR and ID.me sandboxes (done; credentials in Vercel env). 2. Neon Postgres (driver done; create the database in Vercel). 3. Blue Button sandbox (mapper and mock done; register the app). 4. Partner EHR FHIR read, then write. 5. Hospital ADT feed (partner-reported ED visits today). 6. Directory data feed. 7. Evaluator export.
