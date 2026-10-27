/**
 * Vercel Blob store — persistence without a database.
 *
 * Vercel runs the app on many short-lived instances, so an in-memory store cannot carry a record
 * created on one request to the next (the CLEAR callback could not find the account the register
 * page had just created). This driver keeps each mutable collection as one private JSON blob:
 *
 *   careshare/v1/households.json   careshare/v1/staff.json   careshare/v1/accounts.json   careshare/v1/audit.json
 *
 * Reads bypass the CDN cache so every instance sees the latest write; a two-second in-process cache
 * absorbs the several repository calls one page render makes, and any write clears it. Writes are
 * read-modify-write of the whole collection, which is fine for a pilot demo (one clinic, a few dozen
 * households, one actor at a time) and is the first thing Postgres replaces at scale.
 *
 *   BLOB_READ_WRITE_TOKEN   injected by Vercel when a Blob store is connected to the project
 */

import { get, put } from "@vercel/blob";
import type { AuditEntry, CaregiverAccount, Household, StaffUser } from "@/lib/domain/types";
import { loadSeed } from "./memory";
import type { Repository } from "./repository";

const PREFIX = "careshare/v1";
const TTL_MS = 2000;
const AUDIT_CAP = 3000;

type Kind = "households" | "staff" | "accounts" | "audit";
type Doc<K extends Kind> = K extends "households" ? Household : K extends "staff" ? StaffUser : K extends "accounts" ? CaregiverAccount : AuditEntry;

const g = globalThis as unknown as { __careshareBlobCache?: Map<Kind, { at: number; data: unknown[] }> };
const cache = (g.__careshareBlobCache ??= new Map());

function token(): string {
  const t = process.env.BLOB_READ_WRITE_TOKEN;
  if (!t) throw new Error("STORE_DRIVER=blob but BLOB_READ_WRITE_TOKEN is not set.");
  return t;
}

async function readRaw<K extends Kind>(kind: K): Promise<Doc<K>[] | null> {
  const r = await get(`${PREFIX}/${kind}.json`, { access: "private", useCache: false, token: token() });
  if (!r || r.statusCode !== 200 || !r.stream) return null;
  const text = await new Response(r.stream).text();
  return JSON.parse(text) as Doc<K>[];
}

async function write<K extends Kind>(kind: K, data: Doc<K>[]): Promise<void> {
  await put(`${PREFIX}/${kind}.json`, JSON.stringify(data), { access: "private", addRandomSuffix: false, allowOverwrite: true, contentType: "application/json", cacheControlMaxAge: 0, token: token() });
  cache.set(kind, { at: Date.now(), data });
}

/** Read a collection, seeding it on first use (mutable collections only; reference data ships with the build). */
async function read<K extends Kind>(kind: K): Promise<Doc<K>[]> {
  const c = cache.get(kind);
  if (c && Date.now() - c.at < TTL_MS) return c.data as Doc<K>[];
  let data = await readRaw(kind);
  if (data === null) {
    const seed = loadSeed();
    data = (kind === "households" ? seed.households : kind === "staff" ? seed.staff : kind === "accounts" ? seed.accounts : []) as Doc<K>[];
    await write(kind, data);
    if (kind === "households") await appendAudit({ actor: "system", action: "store.seeded", reference: `${seed.households.length} households` });
  }
  cache.set(kind, { at: Date.now(), data });
  return data;
}

async function upsert<K extends Exclude<Kind, "audit">>(kind: K, doc: Doc<K>): Promise<void> {
  cache.delete(kind);
  const list = await read(kind);
  const i = list.findIndex((d) => d.id === doc.id);
  if (i >= 0) list[i] = doc;
  else list.push(doc);
  await write(kind, list);
}

async function appendAudit(entry: Omit<AuditEntry, "id" | "at">): Promise<AuditEntry> {
  cache.delete("audit");
  const list = await read("audit");
  const e: AuditEntry = { id: `aud_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, at: new Date().toISOString(), ...entry };
  list.push(e);
  if (list.length > AUDIT_CAP) list.splice(0, list.length - AUDIT_CAP);
  await write("audit", list);
  return e;
}

export function createBlobRepository(): Repository {
  const seed = loadSeed();
  return {
    driver: "blob",
    async asOf() {
      return process.env.DEMO_AS_OF ?? seed.asOf ?? new Date().toISOString().slice(0, 10);
    },
    async localities() {
      return seed.localities;
    },
    async sites() {
      return seed.sites;
    },
    async education() {
      return seed.education;
    },
    async resources() {
      return seed.resources;
    },
    staff: () => read("staff"),
    staffMember: async (id) => (await read("staff")).find((s) => s.id === id),
    upsertStaff: (s) => upsert("staff", s),
    accounts: () => read("accounts"),
    account: async (id) => (await read("accounts")).find((a) => a.id === id),
    upsertAccount: (a) => upsert("accounts", a),
    households: () => read("households"),
    household: async (id) => (await read("households")).find((h) => h.id === id),
    async updateHousehold(id, mutate) {
      cache.delete("households");
      const list = await read("households");
      const h = list.find((x) => x.id === id);
      if (!h) throw new Error(`Household ${id} not found`);
      await mutate(h);
      await write("households", list);
      return h;
    },
    addHousehold: (h) => upsert("households", h),
    audit: appendAudit,
    async auditLog(filter) {
      const list = await read("audit");
      const limit = filter?.limit ?? 200;
      return list
        .filter((e) => !filter?.householdId || e.householdId === filter.householdId)
        .slice()
        .reverse()
        .slice(0, limit);
    },
    async reset() {
      cache.clear();
      await write("households", seed.households);
      await write("staff", seed.staff);
      await write("accounts", seed.accounts);
      await write("audit", []);
      await appendAudit({ actor: "system", action: "store.seeded", reference: `${seed.households.length} households` });
    },
  };
}
