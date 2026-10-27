import { beforeEach, describe, expect, it, vi } from "vitest";

// In-memory stand-in for Vercel Blob: path → body. Exercises the driver's seeding, read-modify-write and caching.
const blobs = new Map<string, string>();
vi.mock("@vercel/blob", () => ({
  get: vi.fn(async (path: string) => {
    const body = blobs.get(path);
    if (body === undefined) return null;
    return { statusCode: 200, stream: new Response(body).body, blob: { pathname: path } };
  }),
  put: vi.fn(async (path: string, body: string) => {
    blobs.set(path, body);
    return { url: `blob://${path}`, pathname: path };
  }),
}));

process.env.BLOB_READ_WRITE_TOKEN = "test-token";
const { createBlobRepository } = await import("../blob");

describe("blob store", () => {
  beforeEach(() => {
    blobs.clear();
    (globalThis as unknown as { __careshareBlobCache?: Map<string, unknown> }).__careshareBlobCache?.clear();
  });

  it("seeds each collection on first read and persists writes across repository instances", async () => {
    const a = createBlobRepository();
    const hs = await a.households();
    expect(hs.length).toBeGreaterThan(30);
    expect(blobs.has("careshare/v1/households.json")).toBe(true);
    const acct = { id: "acct_test", givenName: "", familyName: "", birthDate: "", phone: "", localityFips: "", access: { smartphone: true, broadband: "ok" as const, preferredChannel: "app" as const }, identity: { status: "not_started" as const, attempts: 0 }, registeredOn: "2026-10-24", householdIds: [] };
    await a.upsertAccount(acct);
    // A different instance (fresh repository, cache cleared as another lambda would be) sees the account.
    (globalThis as unknown as { __careshareBlobCache?: Map<string, unknown> }).__careshareBlobCache?.clear();
    const b = createBlobRepository();
    expect((await b.account("acct_test"))?.id).toBe("acct_test");
  });

  it("updates a household in place and records audit entries newest first", async () => {
    const r = createBlobRepository();
    const first = (await r.households())[0];
    await r.updateHousehold(first.id, (h) => {
      h.carePlan.respiteArrangement = "Tuesdays";
    });
    expect((await r.household(first.id))?.carePlan.respiteArrangement).toBe("Tuesdays");
    await r.audit({ actor: "test", action: "one", householdId: first.id });
    await r.audit({ actor: "test", action: "two", householdId: first.id });
    const log = await r.auditLog({ householdId: first.id });
    expect(log.map((e) => e.action).slice(0, 2)).toEqual(["two", "one"]);
  });

  it("reset restores the seed and clears runtime records", async () => {
    const r = createBlobRepository();
    await r.addHousehold({ ...(await r.households())[0], id: "hh_runtime" });
    expect(await r.household("hh_runtime")).toBeDefined();
    await r.reset();
    expect(await r.household("hh_runtime")).toBeUndefined();
    expect((await r.auditLog()).map((e) => e.action)).toEqual(["store.seeded"]);
  });
});
