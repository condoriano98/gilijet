import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { BOOKING_HORIZON_DAYS, seasonSeedParams } from "@/lib/legs";

/**
 * The nightly top-up must keep producing departures all year.
 *
 * It previously ran on seasonSeedParams(), which clamps to a July–August demo
 * window, so from about September it generated nothing until the following
 * July. Schedules kept only the 14 days of legs created alongside them and then
 * ran dry — silently, because an empty result is indistinguishable from
 * "already topped up".
 */

describe("BOOKING_HORIZON_DAYS", () => {
  it("is a rolling window, not a season", () => {
    expect(BOOKING_HORIZON_DAYS).toBeGreaterThan(14);
    expect(BOOKING_HORIZON_DAYS).toBeLessThanOrEqual(365);
  });
});

describe("seasonSeedParams is season-clamped (why the cron must not use it)", () => {
  // Pinning the old behaviour so the reason for the change stays visible. If
  // seasonSeedParams is ever made rolling, this test should be deleted, not
  // "fixed".
  const cases: [string, "some" | "none"][] = [
    ["2026-07-31", "some"],
    ["2026-08-15", "some"],
    ["2026-09-15", "none"],
    ["2026-10-15", "none"],
    ["2026-12-01", "none"],
  ];

  it.each(cases)("%s generates %s days", (date, expected) => {
    const { daysAhead } = seasonSeedParams(new Date(`${date}T06:00:00Z`));
    if (expected === "some") expect(daysAhead).toBeGreaterThan(0);
    else expect(daysAhead).toBe(0);
  });
});

describe("topup-legs cron", () => {
  const source = readFileSync(
    path.join(process.cwd(), "app", "api", "cron", "topup-legs", "route.ts"),
    "utf8",
  );

  /** The import statement, which is what determines what can actually be called. */
  const legsImport =
    source.match(/import\s*\{([^}]*)\}\s*from\s*["']@\/lib\/legs["']/)?.[1] ?? "";

  it("imports the rolling horizon", () => {
    expect(legsImport).toContain("BOOKING_HORIZON_DAYS");
  });

  it("does not import seasonSeedParams, which would strand it outside July–August", () => {
    // Checked against the import rather than the whole file: the docblock names
    // seasonSeedParams to explain why it is not used here.
    expect(legsImport).not.toContain("seasonSeedParams");
  });
});
