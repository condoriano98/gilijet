import { describe, it, expect } from "vitest";
import {
  refundTierForCustomer,
  refundAmountForCustomer,
  refundAmountForOperatorCancellation,
  computeRefundDeadline,
  snapshotCurrentPolicy,
} from "@/lib/refunds";

describe("refundTierForCustomer", () => {
  it("returns FULL for > 168 hours", () => {
    const now = new Date("2026-06-01T00:00:00Z");
    const departure = new Date("2026-06-10T00:00:00Z"); // 216 hours
    expect(refundTierForCustomer(now, departure)).toBe("FULL");
  });

  it("returns PARTIAL for 48-168 hours", () => {
    const now = new Date("2026-06-05T00:00:00Z");
    const departure = new Date("2026-06-09T00:00:00Z"); // 96 hours
    expect(refundTierForCustomer(now, departure)).toBe("PARTIAL");
  });

  it("returns PARTIAL at exactly 48 hours", () => {
    const now = new Date("2026-06-05T00:00:00Z");
    const departure = new Date("2026-06-07T00:00:00Z"); // 48 hours
    expect(refundTierForCustomer(now, departure)).toBe("PARTIAL");
  });

  it("returns NONE for < 48 hours", () => {
    const now = new Date("2026-06-06T00:00:00Z");
    const departure = new Date("2026-06-07T00:00:00Z"); // 24 hours
    expect(refundTierForCustomer(now, departure)).toBe("NONE");
  });
});

describe("refundAmountForCustomer", () => {
  it("returns full amount for FULL tier", () => {
    const { amount, tier } = refundAmountForCustomer({
      now: new Date("2026-06-01T00:00:00Z"),
      departure: new Date("2026-06-10T00:00:00Z"),
      paidAmount: 500_000,
    });
    expect(tier).toBe("FULL");
    expect(amount.toString()).toBe("500000");
  });

  it("returns 50% for PARTIAL tier", () => {
    const { amount, tier } = refundAmountForCustomer({
      now: new Date("2026-06-05T00:00:00Z"),
      departure: new Date("2026-06-08T00:00:00Z"),
      paidAmount: 500_000,
    });
    expect(tier).toBe("PARTIAL");
    expect(amount.toString()).toBe("250000");
  });

  it("returns 0 for NONE tier", () => {
    const { amount, tier } = refundAmountForCustomer({
      now: new Date("2026-06-07T00:00:00Z"),
      departure: new Date("2026-06-08T00:00:00Z"),
      paidAmount: 500_000,
    });
    expect(tier).toBe("NONE");
    expect(amount.toString()).toBe("0");
  });

  it("ignores any caller-supplied snapshot — only the live policy table determines the fraction", () => {
    // Regression for H-5: previously a caller-supplied snapshot could override
    // the policy table. A persisted-but-attacker-influenced `refundPolicySnapshot`
    // must NOT be able to inflate a refund. The function no longer accepts a
    // snapshot at all; even if a future caller tried to slip one through, the
    // result must remain bound to refundTierForCustomer.
    const { amount, tier } = refundAmountForCustomer({
      now: new Date("2026-06-07T00:00:00Z"),
      departure: new Date("2026-06-08T00:00:00Z"), // 24h → NONE
      paidAmount: 500_000,
      // @ts-expect-error — snapshot is intentionally not a parameter; verify TS rejects it.
      snapshot: { tiers: [{ hoursBeforeDeparture: 0, refundFraction: 1.0 }] },
    });
    expect(tier).toBe("NONE");
    expect(amount.toString()).toBe("0");
  });
});

describe("refundAmountForOperatorCancellation", () => {
  it("always returns full amount", () => {
    const amount = refundAmountForOperatorCancellation(750_000);
    expect(amount.toString()).toBe("750000");
  });
});

describe("computeRefundDeadline", () => {
  it("returns 48 hours before departure", () => {
    const departure = new Date("2026-06-08T12:00:00Z");
    const deadline = computeRefundDeadline(departure);
    const diff = departure.getTime() - deadline.getTime();
    expect(diff).toBe(48 * 60 * 60 * 1000);
  });
});

describe("snapshotCurrentPolicy", () => {
  it("returns a snapshot with the current tiers", () => {
    const snapshot = snapshotCurrentPolicy({
      departure: new Date(),
      deadline: new Date(),
    });
    expect(snapshot.version).toBe("2026-01");
    expect(snapshot.tiers).toHaveLength(3);
    expect(snapshot.tiers[0]).toEqual({ hoursBeforeDeparture: 168, refundFraction: 1.0 });
    expect(snapshot.tiers[1]).toEqual({ hoursBeforeDeparture: 48, refundFraction: 0.5 });
    expect(snapshot.tiers[2]).toEqual({ hoursBeforeDeparture: 0, refundFraction: 0.0 });
    expect(snapshot.snapshotAt).toBeTruthy();
    expect(snapshot.deadline).toBeTruthy();
  });
});
