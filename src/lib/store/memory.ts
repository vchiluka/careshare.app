import { readFileSync } from "node:fs";
import path from "node:path";
import type { AuditEntry, Household, SeedData } from "@/lib/domain/types";
import type { Repository } from "./repository";

interface State {
  seed: SeedData;
  households: Map<string, Household>;
  audit: AuditEntry[];
  counter: number;
}

const g = globalThis as unknown as { __careshareStore?: State };

function loadSeed(): SeedData {
  const p = path.join(process.cwd(), "data", "seed", "seed.json");
  return JSON.parse(readFileSync(p, "utf8")) as SeedData;
}

function fresh(): State {
  const seed = loadSeed();
  return { seed, households: new Map(seed.households.map((h) => [h.id, structuredClone(h)])), audit: [], counter: 0 };
}

function state(): State {
  if (!g.__careshareStore) g.__careshareStore = fresh();
  return g.__careshareStore;
}

export function createMemoryRepository(): Repository {
  return {
    driver: "memory",
    async asOf() {
      return process.env.DEMO_AS_OF ?? state().seed.asOf ?? new Date().toISOString().slice(0, 10);
    },
    async localities() {
      return state().seed.localities;
    },
    async sites() {
      return state().seed.sites;
    },
    async staff() {
      return state().seed.staff;
    },
    async resources() {
      return state().seed.resources;
    },
    async households() {
      return [...state().households.values()].map((h) => structuredClone(h));
    },
    async household(id) {
      const h = state().households.get(id);
      return h ? structuredClone(h) : undefined;
    },
    async updateHousehold(id, mutate) {
      const s = state();
      const cur = s.households.get(id);
      if (!cur) throw new Error(`Household ${id} not found`);
      const draft = structuredClone(cur);
      await mutate(draft);
      s.households.set(id, draft);
      return structuredClone(draft);
    },
    async addHousehold(h) {
      state().households.set(h.id, structuredClone(h));
    },
    async audit(entry) {
      const s = state();
      const e: AuditEntry = { id: `aud_${(++s.counter).toString(36).padStart(5, "0")}`, at: new Date().toISOString(), ...entry };
      s.audit.unshift(e);
      if (s.audit.length > 2000) s.audit.length = 2000;
      return e;
    },
    async auditLog(filter) {
      const xs = state().audit.filter((e) => !filter?.householdId || e.householdId === filter.householdId);
      return xs.slice(0, filter?.limit ?? 200);
    },
    async reset() {
      g.__careshareStore = fresh();
    },
  };
}
