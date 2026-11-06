# CareShare runbook

How the four environments work, how code moves between them, and what to do when something breaks.
Written for the person on call (today: the owner). Every secret named here lives in Vercel environment
variables or GitHub Actions secrets; none is ever pasted into chat, a ticket or a document.

## Environments

| Environment | Vercel | Git | Database | Data | Vendors |
| --- | --- | --- | --- | --- | --- |
| Local | `npm run dev` | any branch | memory store (or a local Postgres via `DATABASE_URL`) | synthetic seed | mock pages |
| Preview | automatic for every branch that is not `production`; `main` is the stable one at `careshare-git-main-vchilukas-projects.vercel.app` | `main` and every PR branch | Neon project `careshare-staging`, branch `production` (shared by all previews) | synthetic seed, reset on demand | mock pages; sandboxes on `main` |
| Production | Production | `production` | Neon project `careshare-prod`, branch `production`, HIPAA enabled, 30-day restore window | real records, never seeded | production vendors |
| v1 demo | project `careshare-v1`, https://careshare-v1.vercel.app | `release/v1.0-rfa-baseline`, frozen | Vercel Blob store (`STORE_DRIVER=blob`) | synthetic seed | sandbox vendors with the v1 host's redirect URIs |


Only production ever holds a real record. "Staging" is the `main` preview: Vercel has no separate
environment for it and none is needed while all previews share one synthetic database. The Neon Vercel
integration is deliberately not installed: it always writes the connected project's connection string
into Vercel Production, which would point production at the staging project, and it has no setting to
limit it to previews. All four connection strings are entered by hand (table below). A pull request that
adds a migration will show `pendingMigrations` on its preview until it is merged and `deploy-staging.yml`
applies it; that is expected. The v1 demo project is the application as submitted with the
RFA, kept running at its own URL for reviewers; it is never pointed at real data and is redeployed only
by hand from its frozen branch. `CARESHARE_ENV=production` is set only there and makes
`npm run db:seed`, `Reset demo data` and `npm run db:migrate -- --down` refuse.

## Variables per environment

| Variable | Local | Preview (Vercel, Sensitive) | Production (Vercel, Sensitive) |
| --- | --- | --- | --- |
| `DATABASE_URL` (pooled, host contains `-pooler`) | optional | `careshare-staging` | `careshare-prod` |
| `DATABASE_URL_UNPOOLED` (direct) | optional | `careshare-staging` | `careshare-prod` |
| `CARESHARE_SECRET` | any 16+ chars | preview value | its own value, rotated yearly |
| `CARESHARE_ENV` | unset | unset | `production` |
| `DEMO_AS_OF` | optional | optional | never |
| vendor switches (`IDENTITY_*`, `BLUEBUTTON_ADAPTER`) | mock | sandbox credentials | production credentials |
| `ALLOW_MEMORY_STORE` | unset | `0` (was `1` before Neon existed; delete the row) | never |

GitHub Actions repository secrets (Settings → Secrets and variables → Actions → Repository secrets):

| Secret | Value | Used by | Required |
| --- | --- | --- | --- |
| `DATABASE_URL_STAGING_UNPOOLED` | `careshare-staging` direct string (same value as Vercel Preview `DATABASE_URL_UNPOOLED`) | `deploy-staging.yml` migrate + seed on every push to `main` | yes |
| `DATABASE_URL_PROD_UNPOOLED` | `careshare-prod` direct string | `release.yml` migrate on push to `production` | before the first release |
| `NEON_API_KEY`, `NEON_STAGING_PROJECT_ID` | API key `careshare-ci`; project id of `careshare-staging` | `ci.yml` `neon-tests`: a throwaway Neon branch per run | optional; the job skips without them |

The same connection string is stored twice on purpose: Vercel feeds the running app, GitHub Actions
runs the migrations. The app never runs DDL, so without the GitHub secret the preview serves 503 with
`pendingMigrations` until someone applies the schema.

## How code moves

1. Branch from `main`, open a pull request. CI runs tests (memory and Postgres), lint, typecheck,
   build, dependency audit, secret scan, and the migration dry run. A preview deployment appears on the
   shared staging database.
2. Merge to `main` after review (CODEOWNERS requires the owner on `db/`, the store, the access engine
   and the actions file). `deploy-staging.yml` migrates and, if empty, seeds the staging database;
   Vercel deploys the same commit as the `main` preview. Check
   `https://careshare-git-main-vchilukas-projects.vercel.app/api/health` reports `ok: true` with the
   expected `schemaVersion`.
3. Release: open a pull request from `main` to `production`, get the owner's approval, merge.
   `release.yml` migrates production. Vercel builds the production deployment and, because
   auto-assign of production domains is off, waits.
4. Smoke test the generated deployment URL: `/api/health` is `ok: true`, `/care` and `/clinic` render,
   one authenticated round trip on staging earlier in the day. Then click **Promote to Production** in
   Vercel. Record the deployment id and schema version in the release PR.

Migrations are expand-then-contract: a release never removes or renames a column the previous release
still reads. That is what lets the migration job and the Vercel deploy run in either order.

## Rollback

- App only: Vercel → Deployments → previous production deployment → **Instant Rollback**. No build.
- App and schema: if the release added a migration the previous app cannot tolerate, roll the app
  back first, then write a forward migration that restores compatibility. Never run `--down` in
  production.
- Data: Neon → `careshare-prod` → Restore → point in time (up to 30 days). Restoring creates a new
  branch; switch `DATABASE_URL` to it and redeploy, then make it the default branch once verified.

## Restore drill (quarterly)

1. In `careshare-staging`, create a branch from a timestamp an hour ago.
2. Point a preview deployment at it (`ALLOW_MEMORY_STORE` not set; `DATABASE_URL` from the branch).
3. Confirm `/api/health` and the roster render. Delete the branch. Note the elapsed time in
   `docs/evidence/`.

## Reset staging

`npm run db:seed -- --reset` with `DATABASE_URL_UNPOOLED` set to the staging direct string (from a
developer machine or a manual workflow run). Documents are replaced; the audit trail is kept and gains
a `store.reseeded` event.

## Local Postgres for tests

`npm run test:db` expects a non-superuser role that owns the test database, because superusers bypass
row-level security and the isolation tests would pass for the wrong reason.

```
createuser -h 127.0.0.1 -p 5433 -U postgres careshare_app --createdb
createdb   -h 127.0.0.1 -p 5433 -U postgres -O careshare_app careshare_test
TEST_DATABASE_URL=postgres://careshare_app@127.0.0.1:5433/careshare_test npm run test:db
```

For a local app on Postgres: `createdb -O careshare_app careshare_dev`, then
`DATABASE_URL=postgres://careshare_app@127.0.0.1:5433/careshare_dev npm run db:migrate && npm run db:seed`,
and start `npm run dev` with the same `DATABASE_URL`.

## When the app reports 503 on /api/health

- `pendingMigrations` non-empty: the migration job has not run or failed. Check the Actions run for
  the branch; rerun it. The app serves again on its own once the schema is current.
- `store unavailable`: `DATABASE_URL` missing or wrong for that environment, or Neon is suspended.
  Check Vercel environment variables for the right target and the Neon console for the project.

## Key rotation

`CARESHARE_SECRET` signs session cookies. Rotating it signs everyone out. Change it in Vercel for one
environment at a time and redeploy. Vendor client secrets rotate in the vendor console first, then in
Vercel, then redeploy; both old and new work during the overlap the vendor allows.

## Deactivating a user

Clinic staff: an admin sets the member to disabled in the console; sessions end at the next request
(WP6 adds immediate invalidation). Caregiver: revoke their authorization on the household; the record
closes at the next request; the account remains for the audit trail.
