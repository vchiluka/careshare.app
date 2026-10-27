import { describe, expect, it } from "vitest";
import { coverageSummary, diagnosesFromImport, fillsFromImport, mapBlueButton } from "../fhir";
import { syntheticBlueButton } from "../synthetic";

const profile = {
  key: "t1",
  givenName: "Mabel",
  familyName: "Hairston",
  birthDate: "1941-05-02",
  gender: "female" as const,
  state: "51",
  postalCode: "245",
  dual: true,
  dementiaCode: "G30.1",
  comorbidities: ["I10", "E78.5"],
  drugs: [
    { ndc: "00093741501", name: "donepezil", strength: "10 mg" },
    { ndc: "68180051301", name: "lisinopril", strength: "20 mg" },
  ],
  asOf: "2026-10-24",
  edVisitDaysAgo: 9,
};

describe("Blue Button 2.0 mapper", () => {
  it("maps synthetic sandbox-shaped resources into the import model", () => {
    const bundle = syntheticBlueButton(profile);
    const imp = mapBlueButton({ ...bundle, pulledOn: "2026-10-24", source: "mock" });
    expect(imp.patient?.familyName).toBe("Hairston");
    expect(imp.counts.coverages).toBe(4);
    expect(imp.counts.pde).toBeGreaterThan(0);
    expect(imp.counts.eobs).toBe(imp.eobs.length);
    const cov = coverageSummary(imp);
    expect(cov.partA && cov.partB && cov.partD).toBe(true);
    expect(cov.dual).toBe(true);
  });
  it("derives fills with NDC and days supply, and diagnoses from claims", () => {
    const imp = mapBlueButton({ ...syntheticBlueButton(profile), pulledOn: "2026-10-24", source: "mock" });
    const fills = fillsFromImport(imp);
    expect(fills.some((f) => f.ndc === "00093741501" && f.daysSupply > 0)).toBe(true);
    const dx = diagnosesFromImport(imp).map((d) => d.code);
    expect(dx).toContain("G30.1");
  });
});
