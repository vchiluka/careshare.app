# CareShare runbook

How the four environments work, how code moves between them, and what to do when something breaks.
Written for the person on call (today: the owner). Every secret named here lives in Vercel environment
variables or GitHub Actions secrets; none is ever pasted into chat, a ticket or a document.

## Environments

| Environment | Vercel | Git | Database | Data | Vendors |
| --- | --- | --- | --- | --- | --- |
| Local | `npm run dev` | any branch | memory store (or a local Postgres via `DATABASE_URL`) | synthetic seed | mock pages |
| Preview | automatic per pull request | the PR branch | Neon branch created from `careshare-staging` `main` by the Neon Vercel integration, deleted with the PR | synthetic (inherited from staging) | mock pages |
| Staging | custom environment `staging` | `main` | Neon project `careshare-staging`, branch `main` | synthetic seed, reset on demand | CLEAR, ID.me and Blue Button sandboxes |
| Production | Production | `release` | Neon project `careshare-prod`, branch `production`, HIPAA enabled, 30-day restore window | real records, never seeded | production vendors |

Only production ever holds a real record. `CARESHARE_ENV=production` is set only there and makes
`npm run db:seed`, `Reset demo data` and `npm run db:migrate -- --down` refuse.

## Variables per environment

| Variable | Local | Preview | Staging | Production |
| --- | --- | --- | --- | --- |
| `DATABASE_URL` (pooled) | optional | injected by the Neon integration | staging project | production project |
| `CARESHARE_SECRET` | any 16+ chars | preview value | staging value | its own value, rotated yearly |
| `CARESHARE_ENV` | unset | unset | unset | `production` |
| `DEMO_AS_OF` | optional | optional | optional | never |
| vendor switches (`IDENTITY_*`, `BLUEBUTTON_ADAPTER`) | mock | mock | live, sandbox credentials | live, production credentials |

GitHub Actions secrets: `NEON_API_KEY`, `NEON_STAGING_PROJECT_ID` (CI test branches),
`DATABASE_URL_STAGING_UNPOOLED` (environment `staging`), `DATABASE_URL_PROD_UNPOOLED` (environment
`production`).

## How code moves

1. Branch from `main`, open a pull request. CI runs tests (memory and Postgres), lint, typecheck,
   build, dependency audit, secret scan, and the migration dry run. A preview deployment appears with
   its own Neon branch.
2. Merge to `main` after review (CODEOWNERS requires the owner on `db/`, the store, the access engine
   and the actions file). `deploy-staging.yml` migrates and, if empty, seeds the staging database;
   Vercel deploys the same commit to `staging`. Check `https://<staging host>/api/health` reports
   `ok: true` with the expected `schemaVersion`.
3. Release: open a pull request from `main` to `release`, get the owner's approval, merge.
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
