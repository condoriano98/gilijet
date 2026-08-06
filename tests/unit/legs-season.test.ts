import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
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

/**
 * The season window still exists for seeding dummy data, but it must not reach
 * leg generation. It used to: the top-up cron asked for BOOKING_HORIZON_DAYS
 * and generateLegsForSchedule silently dropped everything after 31 August, so
 * real year-round schedules ran dry in September.
 */
describe("generateLegsForSchedule is not season-clamped", () => {
  const source = readFileSync(
    new URL("../../lib/legs.ts", import.meta.url),
    "utf8",
  );
  const body = source.slice(source.indexOf("export async function generateLegsForSchedule"));

  it("does not consult demoSeasonWindow when building legs", () => {
    expect(body).not.toContain("demoSeasonWindow(");
  });

  it("still honours daysOfWeek and skips departures already past", () => {
    // The two filters that must survive — without them the function would
    // create legs on days the boat does not sail.
    expect(body).toContain("schedule.daysOfWeek.includes(dow)");
    expect(body).toContain("departureUtc.getTime() <= now.getTime()");
  });
});
