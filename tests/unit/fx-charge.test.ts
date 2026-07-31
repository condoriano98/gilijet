import { describe, it, expect, vi, beforeEach } from "vitest";

const findFirstMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({
  prisma: { fxRate: { findFirst: findFirstMock } },
}));

import {
  quoteForeignCharge,
  FxRateUnavailableError,
  convertIdr,
  MAX_RATE_AGE_MS,
} from "@/lib/fx";

const NOW = new Date("2026-07-31T00:00:00Z");
const fresh = (rate: number) => ({
  rate,
  fetchedAt: new Date(NOW.getTime() - 60_000),
});

/**
 * quoteForeignCharge is the money-grade path: it refuses rather than guesses,
 * and it keeps cents. The display helpers next door do neither.
 */
describe("quoteForeignCharge", () => {
  beforeEach(() => findFirstMock.mockReset());

  it("refuses when no rate is stored rather than falling back to a guess", async () => {
    findFirstMock.mockResolvedValue(null);
    await expect(quoteForeignCharge(650_000, "USD", NOW)).rejects.toBeInstanceOf(
      FxRateUnavailableError,
    );
  });

  it("refuses a rate older than the max age", async () => {
    findFirstMock.mockResolvedValue({
      rate: 16_250,
      fetchedAt: new Date(NOW.getTime() - MAX_RATE_AGE_MS - 1000),
    });
    await expect(quoteForeignCharge(650_000, "USD", NOW)).rejects.toBeInstanceOf(
      FxRateUnavailableError,
    );
  });

  it("accepts a rate just inside the max age", async () => {
    findFirstMock.mockResolvedValue({
      rate: 16_250,
      fetchedAt: new Date(NOW.getTime() - MAX_RATE_AGE_MS + 1000),
    });
    await expect(quoteForeignCharge(650_000, "USD", NOW)).resolves.toMatchObject({
      currency: "USD",
      amount: "40.00",
    });
  });

  it("refuses a currency with no FX support", async () => {
    await expect(quoteForeignCharge(650_000, "IDR", NOW)).rejects.toBeInstanceOf(
      FxRateUnavailableError,
    );
    expect(findFirstMock).not.toHaveBeenCalled();
  });

  it("refuses a non-positive total", async () => {
    await expect(quoteForeignCharge(0, "USD", NOW)).rejects.toBeInstanceOf(
      FxRateUnavailableError,
    );
  });

  it("keeps the cents that the display helper drops", async () => {
    findFirstMock.mockResolvedValue(fresh(16_250));
    const quote = await quoteForeignCharge(655_000, "USD", NOW);

    // 655000 / 16250 = 40.307…
    expect(quote.amount).toBe("40.31");
    // The display path floors this to a whole dollar — 31c short on one booking,
    // which is exactly why charging must not go through it.
    expect(convertIdr(655_000, 16_250)).toBe(40);
  });

  it("records the rate and its age so a refund can reuse them", async () => {
    const row = fresh(16_250);
    findFirstMock.mockResolvedValue(row);
    const quote = await quoteForeignCharge(650_000, "USD", NOW);
    expect(quote.rate).toBe(16_250);
    expect(quote.quotedAt).toEqual(row.fetchedAt);
  });

  it("refuses a zero or negative stored rate instead of dividing by it", async () => {
    findFirstMock.mockResolvedValue({ rate: 0, fetchedAt: NOW });
    await expect(quoteForeignCharge(650_000, "USD", NOW)).rejects.toBeInstanceOf(
      FxRateUnavailableError,
    );
  });

  it("refuses when the converted amount rounds away to nothing", async () => {
    findFirstMock.mockResolvedValue(fresh(1e12));
    await expect(quoteForeignCharge(1, "USD", NOW)).rejects.toBeInstanceOf(
      FxRateUnavailableError,
    );
  });
});
