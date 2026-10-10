import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Prisma } from '@prisma/client';
import {
  getAvailablePorts,
  getDepartingSoon,
  getPopularRoutes,
  getRecentReviews,
  POPULAR_ROUTES_FALLBACK,
} from '@/features/schedules/home-data';

/**
 * Unit tests for src/features/schedules/home-data.ts
 *
 * Tests customer-facing home page queries:
 * - Port availability + grouping by island
 * - Departing soon (with time window filtering)
 * - Popular routes (with fallback + aggregation)
 * - Recent reviews (last 6 months)
 *
 * Mocking: Prisma port, leg, review queries
 */

vi.mock('@/shared/server/db', () => ({
  prisma: {
    port: {
      findMany: vi.fn(),
    },
    leg: {
      findMany: vi.fn(),
    },
    review: {
      findMany: vi.fn(),
    },
  },
}));

import { prisma } from '@/shared/server/db';

afterEach(() => {
  vi.clearAllMocks();
});

describe('getAvailablePorts', () => {
  it('groups active ports by island', async () => {
    vi.mocked(prisma.port.findMany).mockResolvedValueOnce([
      {
        name: 'Sanur',
        shortCode: 'SBY',
        island: 'Bali',
        isActive: true,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        name: 'Kuta',
        shortCode: 'KTA',
        island: 'Bali',
        isActive: true,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        name: 'Mataram',
        shortCode: 'MTR',
        island: 'Lombok',
        isActive: true,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ] as any);

    const result = await getAvailablePorts();

    expect(result).toHaveLength(2);
    expect(result[0].region).toBe('Bali');
    expect(result[0].ports).toHaveLength(2);
    expect(result[1].region).toBe('Lombok');
    expect(result[1].ports).toHaveLength(1);
  });

  it('handles ports with no island as "Other"', async () => {
    vi.mocked(prisma.port.findMany).mockResolvedValueOnce([
      {
        name: 'Floating Marina',
        shortCode: 'FLT',
        island: null,
        isActive: true,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ] as any);

    const result = await getAvailablePorts();

    expect(result[0].region).toBe('Other');
  });

  it('filters for active and non-deleted ports', async () => {
    vi.mocked(prisma.port.findMany).mockResolvedValueOnce([]);

    await getAvailablePorts();

    expect(prisma.port.findMany).toHaveBeenCalledWith({
      where: { isActive: true, deletedAt: null },
      select: expect.any(Object),
      orderBy: expect.any(Array),
    });
  });

  it('sorts regions alphabetically', async () => {
    vi.mocked(prisma.port.findMany).mockResolvedValueOnce([
      { name: 'Z Port', shortCode: 'ZZZ', island: 'Zebra', isActive: true, deletedAt: null },
      { name: 'A Port', shortCode: 'AAA', island: 'Alpha', isActive: true, deletedAt: null },
    ] as any);

    const result = await getAvailablePorts();

    expect(result[0].region).toBe('Alpha');
    expect(result[1].region).toBe('Zebra');
  });

  it('returns empty array when no ports available', async () => {
    vi.mocked(prisma.port.findMany).mockResolvedValueOnce([]);

    const result = await getAvailablePorts();

    expect(result).toEqual([]);
  });
});

describe('getDepartingSoon', () => {
  it('returns departures within default 12-hour window', async () => {
    const now = new Date();
    const in6Hours = new Date(now.getTime() + 6 * 60 * 60 * 1000);

    vi.mocked(prisma.leg.findMany).mockResolvedValueOnce([
      {
        id: 'leg-1',
        departureDate: in6Hours,
        basePrice: new Prisma.Decimal('250000'),
        status: 'OPEN',
        scheduleId: 'sched-1',
        operatorId: 'op-1',
        cancellationReason: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        schedule: {
          originPort: 'BLI',
          destinationPort: 'SBY',
          boat: {
            name: 'Fast Boat',
            operator: { companyName: 'PT Ferry' },
          },
        },
      },
    ] as any);

    const result = await getDepartingSoon();

    expect(result).toHaveLength(1);
    expect(result[0].origin).toBe('BLI');
    expect(result[0].priceIDR).toBe(250000);
  });

  it('accepts custom hoursAhead parameter', async () => {
    vi.mocked(prisma.leg.findMany).mockResolvedValueOnce([]);

    await getDepartingSoon({ hoursAhead: 24 });

    const call = vi.mocked(prisma.leg.findMany).mock.calls[0][0]!;
    const where = call.where as any;
    const end = where.departureDate.lte;
    const start = where.departureDate.gte;
    const diff = (end.getTime() - start.getTime()) / (60 * 60 * 1000);

    expect(diff).toBeCloseTo(24, 0);
  });

  it('respects limit parameter (default 8)', async () => {
    vi.mocked(prisma.leg.findMany).mockResolvedValueOnce([]);

    await getDepartingSoon({ limit: 10 });

    expect(vi.mocked(prisma.leg.findMany).mock.calls[0][0]!.take).toBe(10);
  });

  it('filters for OPEN status and non-deleted schedule/boat', async () => {
    vi.mocked(prisma.leg.findMany).mockResolvedValueOnce([]);

    await getDepartingSoon();

    const call = vi.mocked(prisma.leg.findMany).mock.calls[0][0]!;
    const where = call.where as any;
    expect(where.status).toBe('OPEN');
    expect(where.schedule.deletedAt).toBe(null);
    expect(where.schedule.boat.deletedAt).toBe(null);
  });
});

describe('getPopularRoutes', () => {
  it('returns routes sorted by legCount descending', async () => {
    vi.mocked(prisma.leg.findMany).mockResolvedValueOnce([
      {
        basePrice: new Prisma.Decimal('250000'),
        schedule: {
          originPort: 'BLI',
          destinationPort: 'SBY',
          durationMinutes: 120,
          boat: { operatorId: 'op-1' },
        },
      },
      {
        basePrice: new Prisma.Decimal('250000'),
        schedule: {
          originPort: 'BLI',
          destinationPort: 'SBY',
          durationMinutes: 120,
          boat: { operatorId: 'op-2' },
        },
      },
      {
        basePrice: new Prisma.Decimal('200000'),
        schedule: {
          originPort: 'BLI',
          destinationPort: 'DPS',
          durationMinutes: 60,
          boat: { operatorId: 'op-1' },
        },
      },
    ] as any);

    const result = await getPopularRoutes();

    expect(result[0].origin).toBe('BLI');
    expect(result[0].destination).toBe('SBY');
    expect(result[0].legCount).toBe(2);
  });

  it('returns fallback when no legs available', async () => {
    vi.mocked(prisma.leg.findMany).mockResolvedValueOnce([]);

    const result = await getPopularRoutes(6);

    expect(result).toEqual(POPULAR_ROUTES_FALLBACK.slice(0, 6));
  });

  it('respects limit parameter', async () => {
    vi.mocked(prisma.leg.findMany).mockResolvedValueOnce([]);

    const result = await getPopularRoutes(3);

    expect(result).toHaveLength(3);
  });

  it('calculates cheapest price per route', async () => {
    vi.mocked(prisma.leg.findMany).mockResolvedValueOnce([
      {
        basePrice: new Prisma.Decimal('300000'),
        schedule: {
          originPort: 'BLI',
          destinationPort: 'SBY',
          durationMinutes: 120,
          boat: { operatorId: 'op-1' },
        },
      },
      {
        basePrice: new Prisma.Decimal('250000'), // cheaper
        schedule: {
          originPort: 'BLI',
          destinationPort: 'SBY',
          durationMinutes: 120,
          boat: { operatorId: 'op-2' },
        },
      },
    ] as any);

    const result = await getPopularRoutes();

    expect(result[0].cheapestPriceIDR).toBe(250000);
  });

  it('counts unique operators per route', async () => {
    vi.mocked(prisma.leg.findMany).mockResolvedValueOnce([
      {
        basePrice: new Prisma.Decimal('250000'),
        schedule: {
          originPort: 'BLI',
          destinationPort: 'SBY',
          durationMinutes: 120,
          boat: { operatorId: 'op-1' },
        },
      },
      {
        basePrice: new Prisma.Decimal('250000'),
        schedule: {
          originPort: 'BLI',
          destinationPort: 'SBY',
          durationMinutes: 120,
          boat: { operatorId: 'op-2' },
        },
      },
      {
        basePrice: new Prisma.Decimal('250000'),
        schedule: {
          originPort: 'BLI',
          destinationPort: 'SBY',
          durationMinutes: 120,
          boat: { operatorId: 'op-1' }, // duplicate op-1
        },
      },
    ] as any);

    const result = await getPopularRoutes();

    expect(result[0].operatorCount).toBe(2); // only op-1 and op-2
  });

  it('calculates average duration', async () => {
    vi.mocked(prisma.leg.findMany).mockResolvedValueOnce([
      {
        basePrice: new Prisma.Decimal('250000'),
        schedule: {
          originPort: 'BLI',
          destinationPort: 'SBY',
          durationMinutes: 100,
          boat: { operatorId: 'op-1' },
        },
      },
      {
        basePrice: new Prisma.Decimal('250000'),
        schedule: {
          originPort: 'BLI',
          destinationPort: 'SBY',
          durationMinutes: 140,
          boat: { operatorId: 'op-2' },
        },
      },
    ] as any);

    const result = await getPopularRoutes();

    expect(result[0].durationMinutes).toBe(120); // average of 100 and 140
  });

  it('filters for OPEN status and 14-day window', async () => {
    vi.mocked(prisma.leg.findMany).mockResolvedValueOnce([]);

    await getPopularRoutes();

    const call = vi.mocked(prisma.leg.findMany).mock.calls[0][0]!;
    const where = call.where as any;
    expect(where.status).toBe('OPEN');
    expect(where.schedule.deletedAt).toBe(null);
    expect(where.schedule.boat.deletedAt).toBe(null);
  });
});

describe('getRecentReviews', () => {
  it('returns reviews from last 180 days', async () => {
    const recent = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    vi.mocked(prisma.review.findMany).mockResolvedValueOnce([
      {
        id: 'review-1',
        rating: 5,
        text: 'Great boat!',
        createdAt: recent,
        customer: { fullName: 'John Doe Smith' },
        schedule: { originPort: 'BLI', destinationPort: 'SBY' },
      },
    ] as any);

    const result = await getRecentReviews();

    expect(result).toHaveLength(1);
    expect(result[0].customerFirstName).toBe('John');
  });

  it('extracts first name from customer fullName', async () => {
    vi.mocked(prisma.review.findMany).mockResolvedValueOnce([
      {
        id: 'review-1',
        rating: 4,
        text: 'Good',
        createdAt: new Date(),
        customer: { fullName: 'Muhammad Ali Hassan' },
        schedule: { originPort: 'BLI', destinationPort: 'SBY' },
      },
    ] as any);

    const result = await getRecentReviews();

    expect(result[0].customerFirstName).toBe('Muhammad');
  });

  it('uses "Anonymous" for empty customer name', async () => {
    vi.mocked(prisma.review.findMany).mockResolvedValueOnce([
      {
        id: 'review-1',
        rating: 3,
        text: 'OK',
        createdAt: new Date(),
        customer: { fullName: '   ' },
        schedule: { originPort: 'BLI', destinationPort: 'SBY' },
      },
    ] as any);

    const result = await getRecentReviews();

    expect(result[0].customerFirstName).toBe('Anonymous');
  });

  it('respects limit parameter (default 8)', async () => {
    vi.mocked(prisma.review.findMany).mockResolvedValueOnce([]);

    await getRecentReviews(12);

    expect(vi.mocked(prisma.review.findMany).mock.calls[0][0]!.take).toBe(12);
  });

  it('returns empty array when no recent reviews', async () => {
    vi.mocked(prisma.review.findMany).mockResolvedValueOnce([]);

    const result = await getRecentReviews();

    expect(result).toEqual([]);
  });
});
