import { describe, it, expect } from "vitest";
import { env } from "@/lib/env";
import { computeBookingPriceWithTypes } from "@/lib/pricing";

/**
 * Regression: in the test/degraded environment no env vars are set, so Zod's
 * partial-parse fallback bypasses field defaults. The env loader must coalesce
 * the numeric defaults so pricing never builds `new Prisma.Decimal(undefined)`
 * (which throws "DecimalError: Invalid argument: undefined").
 */
describe("numeric env defaults survive degraded mode", () => {
  it("PLATFORM_COMMISSION_RATE and BOOKING_HOLD_MINUTES are finite numbers", () => {
    expect(Number.isFinite(env.PLATFORM_COMMISSION_RATE)).toBe(true);
    expect(Number.isFinite(env.BOOKING_HOLD_MINUTES)).toBe(true);
  });

  it("computeBookingPriceWithTypes does not throw on a normal booking", () => {
    const r = computeBookingPriceWithTypes({
      unitPrice: 200_000,
      passengerTypes: ["ADULT", "CHILD", "INFANT"],
    });
    expect(Number(r.totalAmount)).toBe(300_000); // 1 + 0.5 + 0
    expect(Number(r.commissionRate)).toBeGreaterThan(0);
  });
});
