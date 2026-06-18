import { describe, it, expect } from "vitest";
import { computeErpFee } from "../../lib/erp-pricing";

describe("computeErpFee", () => {
  it("returns zero for zero tickets", () => {
    const result = computeErpFee({ ticketCount: 0, avgTicketIDR: 400_000 });
    expect(result.totalFee).toBe(0);
    expect(result.blendedRate).toBe(0);
  });

  it("applies tier 1 (1.5%, cap 5000) for 0-500 tickets", () => {
    const result = computeErpFee({ ticketCount: 100, avgTicketIDR: 300_000 });
    expect(result.totalFee).toBe(100 * 4500);
  });

  it("caps at 5000 per ticket when 1.5% exceeds cap", () => {
    const result = computeErpFee({ ticketCount: 10, avgTicketIDR: 500_000 });
    expect(result.totalFee).toBe(10 * 5000);
  });

  it("applies tier 2 (1.2%, cap 4000) for 501-2000 tickets", () => {
    const result = computeErpFee({ ticketCount: 600, avgTicketIDR: 300_000 });
    const tier1Fee = 500 * 4500;
    const tier2Fee = 100 * 3600;
    expect(result.totalFee).toBe(tier1Fee + tier2Fee);
  });

  it("applies tier 3 (1.0%, cap 3000) for 2001-5000 tickets", () => {
    const result = computeErpFee({ ticketCount: 3000, avgTicketIDR: 300_000 });
    const tier1Fee = 500 * 4500;
    const tier2Fee = 1500 * 3600;
    const tier3Fee = 1000 * 3000;
    expect(result.totalFee).toBe(tier1Fee + tier2Fee + tier3Fee);
  });

  it("applies tier 4 (0.8%, cap 2500) for 5000+ tickets", () => {
    const result = computeErpFee({ ticketCount: 6000, avgTicketIDR: 300_000 });
    const tier1Fee = 500 * 4500;
    const tier2Fee = 1500 * 3600;
    const tier3Fee = 3000 * 3000;
    const tier4Fee = 1000 * 2400;
    expect(result.totalFee).toBe(tier1Fee + tier2Fee + tier3Fee + tier4Fee);
  });

  it("computes blended rate correctly", () => {
    const result = computeErpFee({ ticketCount: 100, avgTicketIDR: 300_000 });
    const grossRevenue = 100 * 300_000;
    expect(result.blendedRate).toBeCloseTo(result.totalFee / grossRevenue, 6);
  });
});
