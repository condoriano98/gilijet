import { describe, it, expect } from "vitest";
import {
  computeBookingPrice,
  computeBookingPriceWithTypes,
  parsePricingTiers,
  computeYieldAdjustedPrice,
} from "@/lib/pricing";
import { Prisma } from "@prisma/client";

describe("computeBookingPrice", () => {
  it("computes total for single passenger", () => {
    const result = computeBookingPrice({
      unitPrice: 250_000,
      quantity: 1,
      commissionRate: 0.08,
    });
    expect(result.totalAmount.toString()).toBe("250000");
    expect(result.commissionAmount.toString()).toBe("20000");
    expect(result.operatorAmount.toString()).toBe("230000");
  });

  it("computes total for multiple passengers", () => {
    const result = computeBookingPrice({
      unitPrice: 300_000,
      quantity: 3,
      commissionRate: 0.08,
    });
    expect(result.totalAmount.toString()).toBe("900000");
    expect(result.commissionAmount.toString()).toBe("72000");
    expect(result.operatorAmount.toString()).toBe("828000");
  });

  it("throws for zero quantity", () => {
    expect(() =>
      computeBookingPrice({ unitPrice: 100, quantity: 0, commissionRate: 0.08 }),
    ).toThrow("quantity must be >= 1");
  });

  it("handles large values", () => {
    const result = computeBookingPrice({
      unitPrice: 1_000_000,
      quantity: 10,
      commissionRate: 0.08,
    });
    expect(result.totalAmount.toString()).toBe("10000000");
    expect(result.commissionAmount.toString()).toBe("800000");
  });
});

describe("computeBookingPriceWithTypes", () => {
  it("adults pay full price", () => {
    const result = computeBookingPriceWithTypes({
      unitPrice: 200_000,
      passengerTypes: ["ADULT", "ADULT"],
      commissionRate: 0.08,
    });
    expect(result.totalAmount.toString()).toBe("400000");
    expect(result.adultCount).toBe(2);
    expect(result.seatCount).toBe(2);
  });

  it("children pay 50%", () => {
    const result = computeBookingPriceWithTypes({
      unitPrice: 200_000,
      passengerTypes: ["ADULT", "CHILD", "CHILD"],
      commissionRate: 0.08,
    });
    // 200k + 100k + 100k = 400k
    expect(result.totalAmount.toString()).toBe("400000");
    expect(result.adultCount).toBe(1);
    expect(result.childCount).toBe(2);
    expect(result.seatCount).toBe(3);
  });

  it("infants are free and don't take seats", () => {
    const result = computeBookingPriceWithTypes({
      unitPrice: 200_000,
      passengerTypes: ["ADULT", "ADULT", "INFANT"],
      commissionRate: 0.08,
    });
    expect(result.totalAmount.toString()).toBe("400000");
    expect(result.infantCount).toBe(1);
    expect(result.seatCount).toBe(2);
  });

  it("applies discount before commission", () => {
    const result = computeBookingPriceWithTypes({
      unitPrice: 300_000,
      passengerTypes: ["ADULT", "ADULT"],
      commissionRate: 0.08,
      discountAmount: 100_000,
    });
    // 600k - 100k = 500k, commission = 40k
    expect(result.totalAmount.toString()).toBe("500000");
    expect(result.commissionAmount.toString()).toBe("40000");
  });

  it("discount cannot make total negative", () => {
    const result = computeBookingPriceWithTypes({
      unitPrice: 100_000,
      passengerTypes: ["ADULT"],
      commissionRate: 0.08,
      discountAmount: 999_999,
    });
    expect(result.totalAmount.toString()).toBe("0");
    expect(result.commissionAmount.toString()).toBe("0");
  });

  it("throws for empty passenger list", () => {
    expect(() =>
      computeBookingPriceWithTypes({
        unitPrice: 100,
        passengerTypes: [],
        commissionRate: 0.08,
      }),
    ).toThrow("at least one passenger required");
  });

  it("mixed passengers with correct counts", () => {
    const result = computeBookingPriceWithTypes({
      unitPrice: 250_000,
      passengerTypes: ["ADULT", "ADULT", "CHILD", "CHILD", "INFANT"],
      commissionRate: 0.08,
    });
    // 250k+250k+125k+125k+0 = 750k, commission 8% = 60k
    expect(result.totalAmount.toString()).toBe("750000");
    expect(result.adultCount).toBe(2);
    expect(result.childCount).toBe(2);
    expect(result.infantCount).toBe(1);
    expect(result.seatCount).toBe(4);
    expect(result.commissionAmount.toString()).toBe("60000");
  });
});

describe("parsePricingTiers", () => {
  it("returns null for non-array input", () => {
    expect(parsePricingTiers(null)).toBeNull();
    expect(parsePricingTiers("string")).toBeNull();
    expect(parsePricingTiers(42)).toBeNull();
  });

  it("returns null for empty array", () => {
    expect(parsePricingTiers([])).toBeNull();
  });

  it("parses valid tiers", () => {
    const tiers = parsePricingTiers([
      { minOccupancyPct: 50, multiplier: 1.2 },
      { minOccupancyPct: 80, multiplier: 1.5 },
    ]);
    expect(tiers).toEqual([
      { minOccupancyPct: 50, multiplier: 1.2 },
      { minOccupancyPct: 80, multiplier: 1.5 },
    ]);
  });

  it("ignores malformed entries", () => {
    const tiers = parsePricingTiers([
      { minOccupancyPct: 50, multiplier: 1.2 },
      { invalid: true },
      { minOccupancyPct: "80", multiplier: 1.5 },
      null,
    ]);
    expect(tiers).toEqual([{ minOccupancyPct: 50, multiplier: 1.2 }]);
  });
});

describe("computeYieldAdjustedPrice", () => {
  it("returns base price when no tiers", () => {
    const price = computeYieldAdjustedPrice({
      basePrice: 300_000,
      totalCapacity: 100,
      availableSeats: 50,
    });
    expect(price.toString()).toBe("300000");
  });

  it("applies highest applicable tier", () => {
    const tiers = [
      { minOccupancyPct: 50, multiplier: 1.2 },
      { minOccupancyPct: 80, multiplier: 1.5 },
    ];
    // 50 booked / 100 capacity = 50% occupancy
    const price = computeYieldAdjustedPrice({
      basePrice: 300_000,
      totalCapacity: 100,
      availableSeats: 50,
      tiers,
    });
    expect(price.toString()).toBe("360000"); // 300k * 1.2
  });

  it("applies highest tier when multiple thresholds exceeded", () => {
    const tiers = [
      { minOccupancyPct: 50, multiplier: 1.2 },
      { minOccupancyPct: 80, multiplier: 1.5 },
    ];
    // 90 booked / 100 capacity = 90% occupancy
    const price = computeYieldAdjustedPrice({
      basePrice: 300_000,
      totalCapacity: 100,
      availableSeats: 10,
      tiers,
    });
    expect(price.toString()).toBe("450000"); // 300k * 1.5
  });

  it("returns base price when no threshold exceeded", () => {
    const tiers = [{ minOccupancyPct: 60, multiplier: 1.2 }];
    const price = computeYieldAdjustedPrice({
      basePrice: 300_000,
      totalCapacity: 100,
      availableSeats: 50,
      tiers,
    });
    expect(price.toString()).toBe("300000");
  });
});
