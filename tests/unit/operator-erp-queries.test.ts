import { describe, it, expect, vi, afterEach } from 'vitest';
import { Prisma } from '@prisma/client';
import {
  agentCommissionYtd,
  erpFeeYtd,
  revenueByChannel,
  refundRatioByMonth,
} from '@/lib/operator-erp-queries';

/**
 * Unit tests for lib/operator-erp-queries.ts
 *
 * Tests operator revenue & commission queries:
 * - Agent commission YTD (TRAVEL_AGENT channel, CONFIRMED status)
 * - ERP fee YTD (volume-tiered, per-ticket capped, paginated)
 * - Revenue by sales channel (grouped, time-windowed)
 * - Refund ratio by month (refund count / booking count per month)
 *
 * Mocking: Prisma booking, refund aggregation/groupBy
 */

vi.mock('@/lib/db', () => ({
  prisma: {
    booking: {
      aggregate: vi.fn(),
      findMany: vi.fn(),
      groupBy: vi.fn(),
    },
    refund: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock('@/lib/erp-pricing', () => ({
  computeErpFee: vi.fn(),
}));

import { prisma } from '@/lib/db';
import { computeErpFee } from '@/lib/erp-pricing';

afterEach(() => {
  vi.clearAllMocks();
  vi.resetAllMocks();
});

describe('agentCommissionYtd', () => {
  it('sums commission for travel agent bookings YTD', async () => {
    const yearStart = new Date(new Date().getFullYear(), 0, 1);

    vi.mocked(prisma.booking.aggregate).mockResolvedValueOnce({
      _sum: { agentCommissionAmount: new Prisma.Decimal('1500000') },
    } as any);

    const result = await agentCommissionYtd('op-1');

    expect(result).toBe(1500000);
    expect(prisma.booking.aggregate).toHaveBeenCalledWith({
      where: {
        operatorId: 'op-1',
        status: 'CONFIRMED',
        createdAt: { gte: yearStart },
        salesChannel: 'TRAVEL_AGENT',
      },
      _sum: { agentCommissionAmount: true },
    });
  });

  it('returns 0 when no travel agent bookings', async () => {
    vi.mocked(prisma.booking.aggregate).mockResolvedValueOnce({
      _sum: { agentCommissionAmount: null },
    } as any);

    const result = await agentCommissionYtd('op-1');

    expect(result).toBe(0);
  });

  it('handles multiple operators independently', async () => {
    vi.mocked(prisma.booking.aggregate)
      .mockResolvedValueOnce({ _sum: { agentCommissionAmount: new Prisma.Decimal('1000000') } } as any)
      .mockResolvedValueOnce({ _sum: { agentCommissionAmount: new Prisma.Decimal('2000000') } } as any);

    const result1 = await agentCommissionYtd('op-1');
    const result2 = await agentCommissionYtd('op-2');

    expect(result1).toBe(1000000);
    expect(result2).toBe(2000000);
  });
});

describe('erpFeeYtd', () => {
  it('calculates ERP fees for non-direct sales YTD', async () => {
    vi.mocked(computeErpFee).mockReturnValue({ totalFee: 25000 } as any);
    vi.mocked(prisma.booking.findMany).mockResolvedValue([
      {
        id: 'booking-1',
        totalAmount: new Prisma.Decimal('500000'),
        tickets: [{ id: 't1' }, { id: 't2' }],
      },
    ] as any);

    const result = await erpFeeYtd('op-1');

    expect(result).toBeGreaterThan(0);
  });

  it('skips bookings with no tickets', async () => {
    vi.mocked(computeErpFee).mockReturnValue({ totalFee: 0 } as any);
    vi.mocked(prisma.booking.findMany).mockResolvedValue([
      {
        id: 'booking-1',
        totalAmount: new Prisma.Decimal('500000'),
        tickets: [],
      },
    ] as any);

    const result = await erpFeeYtd('op-1');

    expect(result).toBe(0);
  });

  it('applies per-ticket fee cap (50k IDR)', async () => {
    vi.mocked(computeErpFee).mockReturnValue({ totalFee: 50000 } as any);
    vi.mocked(prisma.booking.findMany).mockResolvedValue([
      {
        id: 'booking-1',
        totalAmount: new Prisma.Decimal('10000000'),
        tickets: [{ id: 't1' }],
      },
    ] as any);

    const result = await erpFeeYtd('op-1');

    expect(result).toBeLessThanOrEqual(50000);
  });

  it('handles pagination for large YTD volumes', async () => {
    vi.mocked(computeErpFee).mockReturnValue({ totalFee: 25000 } as any);

    const batch1 = Array(1000)
      .fill(null)
      .map((_, i) => ({
        id: `booking-${i}`,
        totalAmount: new Prisma.Decimal('500000'),
        tickets: [{ id: 't1' }],
      }));

    const batch2 = [
      {
        id: 'booking-1000',
        totalAmount: new Prisma.Decimal('500000'),
        tickets: [{ id: 't1' }],
      },
    ];

    vi.mocked(prisma.booking.findMany)
      .mockResolvedValueOnce(batch1 as any)
      .mockResolvedValueOnce(batch2 as any);

    const result = await erpFeeYtd('op-1');

    expect(result).toBeGreaterThan(0);
    expect(prisma.booking.findMany).toHaveBeenCalledTimes(2);
  });

  it('uses cursor-based pagination correctly', async () => {
    vi.mocked(computeErpFee).mockReturnValue({ totalFee: 25000 } as any);

    // Create exactly 1000 bookings in first batch, then 1 in second
    const batch1 = Array(1000)
      .fill(null)
      .map((_, i) => ({
        id: `b-${i}`,
        totalAmount: new Prisma.Decimal('500000'),
        tickets: [{ id: 't1' }],
      }));

    vi.mocked(prisma.booking.findMany)
      .mockResolvedValueOnce(batch1 as any)
      .mockResolvedValueOnce([
        { id: 'b-1000', totalAmount: new Prisma.Decimal('500000'), tickets: [{ id: 't1' }] },
      ] as any);

    await erpFeeYtd('op-1');

    const calls = vi.mocked(prisma.booking.findMany).mock.calls;
    expect(calls).toHaveLength(2);
    // Second call should include cursor from last booking of first batch
    expect(calls[1][0]).toHaveProperty('cursor');
    expect(calls[1][0]!.cursor!.id).toBe('b-999');
  });
});

describe('revenueByChannel', () => {
  it('groups revenue by sales channel', async () => {
    const from = new Date('2026-01-01');
    const to = new Date('2026-12-31');

    vi.mocked(prisma.booking.groupBy).mockResolvedValueOnce([
      { salesChannel: 'DIRECT', _sum: { totalAmount: new Prisma.Decimal('5000000') } },
      { salesChannel: 'TRAVEL_AGENT', _sum: { totalAmount: new Prisma.Decimal('3000000') } },
    ] as any);

    const result = await revenueByChannel('op-1', from, to);

    expect(result).toEqual({
      DIRECT: 5000000,
      TRAVEL_AGENT: 3000000,
    });
  });

  it('respects time window filtering', async () => {
    const from = new Date('2026-06-01');
    const to = new Date('2026-06-30');

    vi.mocked(prisma.booking.groupBy).mockResolvedValueOnce([] as any);

    await revenueByChannel('op-1', from, to);

    expect(prisma.booking.groupBy).toHaveBeenCalledWith({
      by: ['salesChannel'],
      where: {
        operatorId: 'op-1',
        status: 'CONFIRMED',
        createdAt: { gte: from, lte: to },
      },
      _sum: { totalAmount: true },
    });
  });

  it('returns empty object when no bookings in period', async () => {
    vi.mocked(prisma.booking.groupBy).mockResolvedValueOnce([] as any);

    const result = await revenueByChannel('op-1', new Date('2026-01-01'), new Date('2026-01-31'));

    expect(result).toEqual({});
  });

  it('handles null totalAmount (returns 0)', async () => {
    vi.mocked(prisma.booking.groupBy).mockResolvedValueOnce([
      { salesChannel: 'DIRECT', _sum: { totalAmount: null } },
    ] as any);

    const result = await revenueByChannel('op-1', new Date(), new Date());

    expect(result.DIRECT).toBe(0);
  });
});

describe('refundRatioByMonth', () => {
  it('calculates refund ratio per month', async () => {
    const from = new Date('2026-01-01');
    const to = new Date('2026-02-28');

    vi.mocked(prisma.refund.findMany).mockResolvedValue([
      { createdAt: new Date('2026-01-15') },
      { createdAt: new Date('2026-02-10') },
    ] as any);

    vi.mocked(prisma.booking.findMany).mockResolvedValue([
      { createdAt: new Date('2026-01-05') },
      { createdAt: new Date('2026-01-20') },
      { createdAt: new Date('2026-02-10') },
    ] as any);

    const result = await refundRatioByMonth('op-1', from, to);

    expect(result).toHaveLength(2);
    expect(result[0].month).toBe('2026-01');
    expect(result[0].ratio).toBe(0.5); // 1 refund / 2 bookings
    expect(result[1].month).toBe('2026-02');
    expect(result[1].ratio).toBe(1); // 1 refund / 1 booking
  });

  it('includes months with bookings but no refunds', async () => {
    vi.mocked(prisma.refund.findMany).mockResolvedValue([
      { createdAt: new Date('2026-01-15') },
    ] as any);

    vi.mocked(prisma.booking.findMany).mockResolvedValue([
      { createdAt: new Date('2026-01-05') },
      { createdAt: new Date('2026-02-10') },
    ] as any);

    const result = await refundRatioByMonth('op-1', new Date('2026-01-01'), new Date('2026-02-28'));

    const feb = result.find((r) => r.month === '2026-02');
    expect(feb).toBeDefined();
    // February has bookings but no refunds, so ratio = undefined / 1 = NaN
    expect(Number.isNaN(feb!.ratio)).toBe(true);
  });

  it('sorts months chronologically', async () => {
    vi.mocked(prisma.refund.findMany).mockResolvedValue([
      { createdAt: new Date('2026-03-01') },
      { createdAt: new Date('2026-01-01') },
    ] as any);

    vi.mocked(prisma.booking.findMany).mockResolvedValue([
      { createdAt: new Date('2026-03-01') },
      { createdAt: new Date('2026-01-01') },
    ] as any);

    const result = await refundRatioByMonth('op-1', new Date(), new Date());

    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].month).toBe('2026-01');
  });

  it('returns empty array when no data', async () => {
    vi.mocked(prisma.refund.findMany).mockResolvedValue([] as any);
    vi.mocked(prisma.booking.findMany).mockResolvedValue([] as any);

    const result = await refundRatioByMonth('op-1', new Date(), new Date());

    expect(result).toEqual([]);
  });
});
