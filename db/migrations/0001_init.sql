-- 0001_init: tenants, the household document store with row-level security, and the audit schema.
--
-- Conventions for every migration in this folder:
--   * Forward-only files named NNNN_name.sql, applied in order by `npm run db:migrate`.
--   * Each file runs inside one transaction; keep DDL compatible with the previous release
--     (expand first, contract in a later migration) because the app may deploy before or after it.
--   * Never put data from real people in a migration. Seed data lives in scripts/seed-db.ts and is
--     refused in production.
--   * The companion NNNN_name.down.sql is applied by `npm run db:migrate -- --down NNNN` and is
--     exercised once on staging before a release.

-- ---------------------------------------------------------------------------
-- Tenants. One row per contracting clinic or network. WP5 adds sites, memberships and invitations;
-- WP1 only needs the key so every record carries it from the first day.
-- ---------------------------------------------------------------------------
create table tenants (
  id          text primary key,
  name        text not null,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- The household aggregate and the other mutable documents (staff, accounts) as JSONB.
-- version supports optimistic concurrency: updateHousehold compares and increments it.
-- ---------------------------------------------------------------------------
create table documents (
  tenant_id   text not null references tenants (id),
  kind        text not null check (kind in ('household', 'staff', 'account')),
  id          text not null,
  data        jsonb not null,
  version     integer not null default 1,
  updated_at  timestamptz not null default now(),
  updated_by  text not null default 'system',
  primary key (kind, id)
);
create index documents_tenant_kind_idx on documents (tenant_id, kind);

-- Row-level security: a connection may only see rows for the tenant named in app.tenant_id.
-- FORCE applies the policy to the table owner too, which is the role Neon hands out by default.
-- A missing or empty setting matches nothing, so a request that forgot to set its tenant reads nothing
-- rather than everything. Maintenance jobs set app.tenant_id = '*'.
alter table documents enable row level security;
alter table documents force row level security;
create policy documents_tenant_isolation on documents
  using (
    current_setting('app.tenant_id', true) = '*'
    or tenant_id = current_setting('app.tenant_id', true)
  )
  with check (
    current_setting('app.tenant_id', true) = '*'
    or tenant_id = current_setting('app.tenant_id', true)
  );

-- ---------------------------------------------------------------------------
-- Small key/value table for the store's own bookkeeping (seed generation date, schema facts).
-- ---------------------------------------------------------------------------
create table meta (
  key    text primary key,
  value  text not null
);

-- ---------------------------------------------------------------------------
-- Audit. Its own schema so WP2 can grant an insert-only role on it without touching anything else.
-- hash = sha256(prev_hash || canonical row), computed by the application; a nightly verifier walks
-- the chain per tenant. No PHI: actor ids, action names, household ids, references and counts only.
-- ---------------------------------------------------------------------------
create schema audit;

create table audit.events (
  id            bigint generated always as identity primary key,
  at            timestamptz not null default now(),
  tenant_id     text not null,
  actor         text not null,
  action        text not null,
  household_id  text,
  reference     text,
  detail        text,
  prev_hash     text not null,
  hash          text not null
);
create index audit_events_tenant_idx on audit.events (tenant_id, id desc);
create index audit_events_household_idx on audit.events (household_id, id desc);

alter table audit.events enable row level security;
alter table audit.events force row level security;
create policy audit_tenant_isolation on audit.events
  using (
    current_setting('app.tenant_id', true) = '*'
    or tenant_id = current_setting('app.tenant_id', true)
  )
  with check (
    current_setting('app.tenant_id', true) = '*'
    or tenant_id = current_setting('app.tenant_id', true)
  );

-- The audit trail is append-only. Even the owner role cannot change or remove a row; the only way
-- is to drop the rule in a reviewed migration, which the chain verifier would then report.
create rule audit_events_no_update as on update to audit.events do instead nothing;
create rule audit_events_no_delete as on delete to audit.events do instead nothing;

-- The demo tenant every existing synthetic record moves under. WP5 replaces it with real onboarding.
insert into tenants (id, name) values ('demo', 'Demo clinic (synthetic)');
