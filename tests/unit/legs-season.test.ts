import { describe, it, expect } from "vitest";
import { demoSeasonWindow, seasonSeedParams } from "@/lib/legs";
import { ymdInZone } from "@/lib/datetime";

/**
 * The dummy schedule must span only July–August (WITA) of the seeding year.
 */
describe("demoSeasonWindow", () => {
  it("spans 1 Jul – 31 Aug (WITA) of the reference year", () => {
    const { start, end } = demoSeasonWindow(new Date("2026-07-13T00:00:00Z"));
    expect(ymdInZone(start)).toBe("2026-07-01");
    expect(ymdInZone(end)).toBe("2026-08-31");
  });

  it("uses the reference year", () => {
    const { start } = demoSeasonWindow(new Date("2027-08-01T00:00:00Z"));
    expect(ymdInZone(start)).toBe("2027-07-01");
  });
});

describe("seasonSeedParams", () => {
  it("in-season ref starts at now and reaches season end", () => {
    const ref = new Date("2026-07-13T04:00:00Z"); // mid-July WITA
    const { startAt, daysAhead } = seasonSeedParams(ref);
    expect(startAt.getTime()).toBe(ref.getTime());
    expect(daysAhead).toBeGreaterThan(40); // ~49 days to 31 Aug
  });

  it("pre-season ref starts at the season start", () => {
    const { startAt } = seasonSeedParams(new Date("2026-06-15T00:00:00Z"));
    expect(ymdInZone(startAt)).toBe("2026-07-01");
  });

  it("post-season ref yields zero days (no out-of-season legs)", () => {
    const { daysAhead } = seasonSeedParams(new Date("2026-09-15T00:00:00Z"));
    expect(daysAhead).toBe(0);
  });
});
