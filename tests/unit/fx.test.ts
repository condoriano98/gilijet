import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Prisma } from '@prisma/client';
import {
  isSupportedCurrency,
  getLatestRates,
  convertIdr,
  formatWithDisplay,
  refreshRatesFromProvider,
  quoteForeignCharge,
  FxRateUnavailableError,
  MAX_RATE_AGE_MS,
} from '@/lib/fx';

/**
 * Unit tests for lib/fx.ts
 *
 * Tests foreign exchange rate handling:
 * - Currency support validation
 * - Display-grade conversions (approximate, error-swallowing)
 * - Money-grade quotes (exact, strict validation, refuses stale rates)
 * - Provider API integration with retry logic
 * - Rate freshness validation (max 72h old)
 *
 * Mocking: Prisma fxRate queries, fetch API
 */

vi.mock('@/lib/db', () => ({
  prisma: {
    fxRate: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  },
}));

import { prisma } from '@/lib/db';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  vi.clearAllMocks();
  mockFetch.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('isSupportedCurrency', () => {
  it('accepts USD', () => {
    expect(isSupportedCurrency('USD')).toBe(true);
  });

  it('accepts all supported currencies', () => {
    const supported = ['USD', 'EUR', 'AUD', 'SGD', 'MYR', 'THB', 'CNY', 'JPY', 'KRW'];
    supported.forEach((c) => {
      expect(isSupportedCurrency(c)).toBe(true);
    });
  });

  it('rejects unsupported currency', () => {
    expect(isSupportedCurrency('GBP')).toBe(false);
    expect(isSupportedCurrency('XYZ')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isSupportedCurrency('')).toBe(false);
  });
});

describe('getLatestRates', () => {
  it('returns map of latest rates by currency', async () => {
    vi.mocked(prisma.fxRate.findMany).mockResolvedValueOnce([
      { currency: 'USD', rate: new Prisma.Decimal('17925'), fetchedAt: new Date() },
      { currency: 'EUR', rate: new Prisma.Decimal('19500'), fetchedAt: new Date() },
    ] as any);

    const rates = await getLatestRates();

    expect(rates.get('USD')).toBe(17925);
    expect(rates.get('EUR')).toBe(19500);
  });

  it('returns empty map when query fails', async () => {
    vi.mocked(prisma.fxRate.findMany).mockRejectedValueOnce(new Error('DB down'));

    const rates = await getLatestRates();

    expect(rates.size).toBe(0);
  });

  it('takes only latest rate per currency when multiple exist', async () => {
    vi.mocked(prisma.fxRate.findMany).mockResolvedValueOnce([
      { currency: 'USD', rate: new Prisma.Decimal('17925'), fetchedAt: new Date('2026-01-02') },
      { currency: 'USD', rate: new Prisma.Decimal('17900'), fetchedAt: new Date('2026-01-01') },
      { currency: 'EUR', rate: new Prisma.Decimal('19500'), fetchedAt: new Date('2026-01-02') },
    ] as any);

    const rates = await getLatestRates();

    expect(rates.get('USD')).toBe(17925); // Newer rate
    expect(rates.size).toBe(2);
  });
});

describe('convertIdr', () => {
  it('converts IDR to foreign currency and rounds', () => {
    const idr = 1000000; // 1M IDR
    const rate = 17925; // IDR per USD

    const result = convertIdr(idr, rate);

    expect(result).toBe(56); // 1M / 17925 ≈ 55.78 → 56
  });

  it('handles precise rates', () => {
    expect(convertIdr(500000, 10000)).toBe(50);
    expect(convertIdr(1000000, 15000)).toBe(67); // Rounded
  });
});

describe('formatWithDisplay', () => {
  it('displays IDR primary with secondary conversion', () => {
    const rates = new Map([['USD', 17925]]);

    const result = formatWithDisplay(1000000, 'USD', rates);

    expect(result.primary).toContain('Rp');
    expect(result.primary).toContain('1.000.000');
    expect(result.secondary).toContain('$');
    expect(result.secondary).toContain('USD');
  });

  it('returns null secondary for unsupported currency', () => {
    const rates = new Map();

    const result = formatWithDisplay(1000000, 'GBP', rates);

    expect(result.primary).toContain('Rp');
    expect(result.secondary).toBeNull();
  });

  it('returns null secondary when rate missing', () => {
    const rates = new Map([['EUR', 19500]]);

    const result = formatWithDisplay(1000000, 'USD', rates);

    expect(result.secondary).toBeNull();
  });

  it('uses correct currency symbols', () => {
    const rates = new Map([
      ['USD', 17925],
      ['EUR', 19500],
      ['JPY', 120],
    ]);

    expect(formatWithDisplay(1000000, 'USD', rates).secondary).toContain('$');
    expect(formatWithDisplay(1000000, 'EUR', rates).secondary).toContain('€');
    expect(formatWithDisplay(1000000, 'JPY', rates).secondary).toContain('¥');
  });
});

describe('refreshRatesFromProvider', () => {
  it('fetches rates and stores them', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        result: 'success',
        rates: {
          IDR: 17925,
          USD: 1,
          EUR: 0.92,
          AUD: 1.53,
        },
      }),
    });

    vi.mocked(prisma.fxRate.create).mockResolvedValue({} as any);

    const stored = await refreshRatesFromProvider();

    expect(stored).toBe(3); // EUR, AUD, others not included
    expect(prisma.fxRate.create).toHaveBeenCalledTimes(3);
  });

  it('throws error on non-200 response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 429 });

    await expect(refreshRatesFromProvider()).rejects.toThrow('returned 429');
  });

  it('throws error when response indicates failure', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ result: 'error' }),
    });

    await expect(refreshRatesFromProvider()).rejects.toThrow('reported error');
  });

  it('throws error when IDR rate missing', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ result: 'success', rates: { USD: 1 } }),
    });

    await expect(refreshRatesFromProvider()).rejects.toThrow('no usable IDR rate');
  });

  it('throws error when no supported currencies returned', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        result: 'success',
        rates: { IDR: 17925, XYZ: 999 },
      }),
    });

    await expect(refreshRatesFromProvider()).rejects.toThrow('no supported currencies');
  });
});

describe('quoteForeignCharge', () => {
  it('returns money-grade quote with exact cents', async () => {
    const now = new Date('2026-01-15T10:00:00Z');
    vi.mocked(prisma.fxRate.findFirst).mockResolvedValueOnce({
      currency: 'USD',
      rate: new Prisma.Decimal('17925'),
      fetchedAt: new Date('2026-01-15T08:00:00Z'), // Fresh
    } as any);

    const quote = await quoteForeignCharge(1000000, 'USD', now);

    expect(quote.currency).toBe('USD');
    expect(quote.amount).toMatch(/^\d+\.\d{2}$/); // 2 decimal places
    expect(parseFloat(quote.amount)).toBeCloseTo(55.78, 1);
    expect(quote.rate).toBe(17925);
  });

  it('throws FxRateUnavailableError for unsupported currency', async () => {
    await expect(quoteForeignCharge(1000000, 'GBP')).rejects.toThrow(FxRateUnavailableError);
  });

  it('throws error for non-positive amount', async () => {
    await expect(quoteForeignCharge(0, 'USD')).rejects.toThrow(FxRateUnavailableError);
    await expect(quoteForeignCharge(-1000, 'USD')).rejects.toThrow(FxRateUnavailableError);
  });

  it('refuses stale rates (>72h old)', async () => {
    const now = new Date('2026-01-20T10:00:00Z');
    const staleDate = new Date('2026-01-15T10:00:00Z'); // 5 days old

    vi.mocked(prisma.fxRate.findFirst).mockResolvedValueOnce({
      currency: 'USD',
      rate: new Prisma.Decimal('17925'),
      fetchedAt: staleDate,
    } as any);

    await expect(quoteForeignCharge(1000000, 'USD', now)).rejects.toThrow(
      FxRateUnavailableError,
    );
  });

  it('accepts fresh rates within 72h', async () => {
    const now = new Date('2026-01-18T10:00:00Z');
    const freshDate = new Date('2026-01-16T10:00:00Z'); // 2 days old

    vi.mocked(prisma.fxRate.findFirst).mockResolvedValueOnce({
      currency: 'USD',
      rate: new Prisma.Decimal('17925'),
      fetchedAt: freshDate,
    } as any);

    const quote = await quoteForeignCharge(1000000, 'USD', now);

    expect(quote.amount).toMatch(/^\d+\.\d{2}$/);
    expect(parseFloat(quote.amount)).toBeCloseTo(55.78, 1);
  });

  it('throws error when converted amount rounds to zero', async () => {
    const now = new Date();
    vi.mocked(prisma.fxRate.findFirst).mockResolvedValueOnce({
      currency: 'USD',
      rate: new Prisma.Decimal('1000000000'),
      fetchedAt: now,
    } as any);

    await expect(quoteForeignCharge(1, 'USD', now)).rejects.toThrow(FxRateUnavailableError);
  });
});
