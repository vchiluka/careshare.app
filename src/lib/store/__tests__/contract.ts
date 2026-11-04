/**
 * Repository contract: the behaviour every driver must share. Imported by the memory and postgres
 * test files so the two stay equivalent. Uses only the public Repository interface.
 */

import { describe, expect, it } from "vitest";
import type { Repository } from "../repository";

export function repositoryContract(name: string, make: () => Promise<Repository>) {
  describe(`${name} repository contract`, () => {
    it("serves the synthetic seed after reset", async () => {
      const repo = await make();
      await repo.reset();
      const hs = await repo.households();
      expect(hs.length).toBeGreaterThan(5);
      expect((await repo.staff()).length).toBeGreaterThan(0);
      expect((await repo.localities()).length).toBeGreaterThan(0);
      const first = hs[0];
      expect(await repo.household(first.id)).toMatchObject({ id: first.id });
      expect(await repo.household("hh_does_not_exist")).toBeUndefined();
    });

    it("updateHousehold persists a mutation and returns the new state", async () => {
      const repo = await make();
      await repo.reset();
      const [h] = await repo.households();
      const before = h.patient.givenName;
      const out = await repo.updateHousehold(h.id, (d) => {
        d.patient.givenName = `${before}-edited`;
      });
      expect(out.patient.givenName).toBe(`${before}-edited`);
      expect((await repo.household(h.id))?.patient.givenName).toBe(`${before}-edited`);
      await expect(repo.updateHousehold("hh_missing", () => {})).rejects.toThrow(/not found/);
    });

    it("upserts staff and accounts and adds households", async () => {
      const repo = await make();
      await repo.reset();
      const [s] = await repo.staff();
      await repo.upsertStaff({ ...s, name: "Changed Name" });
      expect((await repo.staffMember(s.id))?.name).toBe("Changed Name");
      const [h] = await repo.households();
      await repo.addHousehold({ ...h, id: "hh_contract_new" });
      expect(await repo.household("hh_contract_new")).toBeTruthy();
    });

    it("audits in order and filters by household", async () => {
      const repo = await make();
      await repo.reset();
      const a = await repo.audit({ actor: "staff:test", action: "contract.one", householdId: "hh_a" });
      const b = await repo.audit({ actor: "staff:test", action: "contract.two", householdId: "hh_b", reference: "ref" });
      expect(a.id).not.toBe(b.id);
      const all = await repo.auditLog({ limit: 5 });
      expect(all[0].action).toBe("contract.two");
      expect(all[1].action).toBe("contract.one");
      const only = await repo.auditLog({ householdId: "hh_b" });
      expect(only.every((e) => e.householdId === "hh_b")).toBe(true);
      expect(only[0].reference).toBe("ref");
    });

    it("reports health", async () => {
      const repo = await make();
      const h = await repo.health();
      expect(h.driver).toBe(repo.driver);
      expect(h.ok).toBe(true);
      expect(h.pendingMigrations).toEqual([]);
    });
  });
}
