import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const findFirstMock = vi.hoisted(() => vi.fn());
const createMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({
  prisma: { fxRate: { findFirst: findFirstMock, create: createMock } },
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
  beforeEach(() => {
    findFirstMock.mockReset();
    createMock.mockReset().mockResolvedValue({});
    // Default: provider unreachable, so the existing cases keep asserting the
    // refuse-rather-than-guess behaviour they were written for.
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("provider down");
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

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

/**
 * PayPal is the backup for a card that was just declined, so it cannot be gated
 * behind a cron that runs at most daily and may never have run at all. A cold
 * table fetches inline; a failure still refuses rather than guessing.
 *
 * Each case re-imports lib/fx so the module-scope failure cooldown starts
 * clean — a previous test's simulated provider outage would otherwise suppress
 * the inline refresh here, which is the cooldown working as intended.
 */
describe("quoteForeignCharge cold path", () => {
  beforeEach(() => {
    findFirstMock.mockReset();
    createMock.mockReset().mockResolvedValue({});
    vi.resetModules();
  });
  afterEach(() => vi.unstubAllGlobals());

  const loadFx = () => import("@/lib/fx");
  const provider = (rates: Record<string, number>) =>
    vi.fn(async () => ({ ok: true, json: async () => ({ rates }) }));

  it("fetches and stores a rate when the table is empty", async () => {
    // Empty first, populated after the inline refresh.
    findFirstMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ rate: 16_250, fetchedAt: NOW });
    const fetchMock = provider({ USD: 1 / 16_250 });
    vi.stubGlobal("fetch", fetchMock);

    const { quoteForeignCharge: quote } = await loadFx();
    expect((await quote(650_000, "USD", NOW)).amount).toBe("40.00");
    expect(fetchMock).toHaveBeenCalledOnce();
    // Stored, so the next request reads the table instead of the network.
    expect(createMock).toHaveBeenCalled();
  });

  it("does not touch the provider when a fresh rate already exists", async () => {
    findFirstMock.mockResolvedValue(fresh(16_250));
    const fetchMock = provider({ USD: 1 / 16_250 });
    vi.stubGlobal("fetch", fetchMock);

    const { quoteForeignCharge: quote } = await loadFx();
    await quote(650_000, "USD", NOW);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("still refuses when the provider fails — never a guessed rate", async () => {
    findFirstMock.mockResolvedValue(null);
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("provider down");
    }));

    const { quoteForeignCharge: quote, FxRateUnavailableError: Err } = await loadFx();
    await expect(quote(650_000, "USD", NOW)).rejects.toBeInstanceOf(Err);
  });

  it("does not retry the provider again inside the cooldown", async () => {
    findFirstMock.mockResolvedValue(null);
    const fetchMock = vi.fn(async () => {
      throw new Error("provider down");
    });
    vi.stubGlobal("fetch", fetchMock);

    const { quoteForeignCharge: quote } = await loadFx();
    await quote(650_000, "USD", NOW).catch(() => {});
    await quote(650_000, "USD", NOW).catch(() => {});
    // One outage must not add the provider timeout to every render.
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
