import { afterEach, describe, expect, it } from "vitest";
import { storeDriver } from "../index";

const keys = ["STORE_DRIVER", "DATABASE_URL", "BLOB_READ_WRITE_TOKEN", "VERCEL", "VERCEL_ENV", "CARESHARE_ENV", "ALLOW_MEMORY_STORE"] as const;
const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
function env(vars: Partial<Record<(typeof keys)[number], string>>) {
  for (const k of keys) delete process.env[k];
  Object.assign(process.env, vars);
}

describe("store selection", () => {
  afterEach(() => {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });
  it("defaults to memory locally and postgres when DATABASE_URL is set", () => {
    env({});
    expect(storeDriver()).toBe("memory");
    env({ DATABASE_URL: "postgres://x" });
    expect(storeDriver()).toBe("postgres");
  });
  it("refuses memory on Vercel unless explicitly allowed", () => {
    env({ VERCEL: "1" });
    expect(() => storeDriver()).toThrow(/postgres store/);
    env({ VERCEL: "1", ALLOW_MEMORY_STORE: "1" });
    expect(storeDriver()).toBe("memory");
  });
  it("never picks blob automatically, and refuses it in production", () => {
    env({ BLOB_READ_WRITE_TOKEN: "t" });
    expect(storeDriver()).toBe("memory");
    env({ STORE_DRIVER: "blob", BLOB_READ_WRITE_TOKEN: "t" });
    expect(storeDriver()).toBe("blob");
    env({ STORE_DRIVER: "blob", BLOB_READ_WRITE_TOKEN: "t", VERCEL_ENV: "production" });
    expect(() => storeDriver()).toThrow(/not allowed in production/);
    env({ STORE_DRIVER: "blob", BLOB_READ_WRITE_TOKEN: "t", CARESHARE_ENV: "production" });
    expect(() => storeDriver()).toThrow(/not allowed in production/);
    env({ STORE_DRIVER: "blob" });
    expect(() => storeDriver()).toThrow(/BLOB_READ_WRITE_TOKEN/);
  });
});
