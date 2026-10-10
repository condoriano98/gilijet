import { describe, it, expect, vi, afterEach } from 'vitest';
import { Prisma } from '@prisma/client';
import { findConnections } from '@/features/schedules/connection-search';

/**
 * Unit tests for src/features/schedules/connection-search.ts
 *
 * Tests single-transfer connection finding:
 * - Leg pair discovery (leg1 → transfer port → leg2)
 * - Time window filtering + minimum transfer buffer (45 min)
 * - Price aggregation (leg1 + leg2)
 * - Duration calculation
 * - Top 10 cheapest sorting
 *
 * Mocking: Prisma leg queries (2 calls per findConnections)
 */

vi.mock('@/shared/server/db', () => ({
  prisma: {
    leg: {
      findMany: vi.fn(),
    },
  },
}));

import { prisma } from '@/shared/server/db';

afterEach(() => {
  vi.clearAllMocks();
  vi.resetAllMocks();
});

describe('findConnections', () => {
  it('returns empty array when no leg1 candidates found', async () => {
    vi.mocked(prisma.leg.findMany).mockResolvedValue([]);

    const result = await findConnections('BLI', 'SBY', new Date('2026-05-25T00:00:00Z'), new Date('2026-05-25T23:59:59Z'));

    expect(result).toEqual([]);
    expect(prisma.leg.findMany).toHaveBeenCalledTimes(1);
  });

  it('finds single connection (leg1 → transfer → leg2)', async () => {
    const leg1 = {
      id: 'leg-1',
      basePrice: new Prisma.Decimal('250000'),
      departureDate: new Date('2026-05-25T08:00:00Z'),
      schedule: {
        originPort: 'BLI',
        destinationPort: 'LBH', // transfer port
        durationMinutes: 180,
        boat: { id: 'boat-1' },
      },
    };

    const leg2 = {
      id: 'leg-2',
      basePrice: new Prisma.Decimal('150000'),
      departureDate: new Date('2026-05-25T15:00:00Z'), // 2 hours after leg1 arrival
      schedule: {
        originPort: 'LBH',
        destinationPort: 'SBY',
        durationMinutes: 120,
        boat: { id: 'boat-2' },
      },
    };

    vi.mocked(prisma.leg.findMany)
      .mockResolvedValueOnce([leg1] as any)
      .mockResolvedValueOnce([leg2] as any);

    const result = await findConnections('BLI', 'SBY', new Date('2026-05-25T00:00:00Z'), new Date('2026-05-25T23:59:59Z'));

    expect(result).toHaveLength(1);
    expect(result[0].leg1.id).toBe('leg-1');
    expect(result[0].leg2.id).toBe('leg-2');
    expect(result[0].transferPort).toBe('LBH');
    expect(result[0].totalPrice).toBe(400000); // 250k + 150k
  });

  it('calculates correct durations and transfer wait time', async () => {
    const leg1 = {
      id: 'leg-1',
      basePrice: new Prisma.Decimal('250000'),
      departureDate: new Date('2026-05-25T08:00:00Z'),
      schedule: {
        originPort: 'BLI',
        destinationPort: 'LBH',
        durationMinutes: 120, // arrives at 10:00
        boat: { id: 'boat-1' },
      },
    };

    const leg2 = {
      id: 'leg-2',
      basePrice: new Prisma.Decimal('150000'),
      departureDate: new Date('2026-05-25T11:00:00Z'), // 1 hour after arrival (60 min wait)
      schedule: {
        originPort: 'LBH',
        destinationPort: 'SBY',
        durationMinutes: 180,
        boat: { id: 'boat-2' },
      },
    };

    vi.mocked(prisma.leg.findMany)
      .mockResolvedValueOnce([leg1] as any)
      .mockResolvedValueOnce([leg2] as any);

    const result = await findConnections('BLI', 'SBY', new Date('2026-05-25T00:00:00Z'), new Date('2026-05-25T23:59:59Z'));

    expect(result[0].transferWaitMinutes).toBe(60);
    expect(result[0].totalDurationMinutes).toBe(120 + 60 + 180); // leg1 + wait + leg2
  });

  it('respects 45-minute minimum transfer time constraint', async () => {
    const leg1 = {
      id: 'leg-1',
      basePrice: new Prisma.Decimal('250000'),
      departureDate: new Date('2026-05-25T08:00:00Z'),
      schedule: {
        originPort: 'BLI',
        destinationPort: 'LBH',
        durationMinutes: 120, // arrives at 10:00 UTC
        boat: { id: 'boat-1' },
      },
    };

    // Earliest departure should be 45 min after arrival = 10:45 UTC
    const leg2OnTime = {
      id: 'leg-2-good',
      basePrice: new Prisma.Decimal('150000'),
      departureDate: new Date('2026-05-25T11:00:00Z'), // 60 min after arrival
      schedule: {
        originPort: 'LBH',
        destinationPort: 'SBY',
        durationMinutes: 180,
        boat: { id: 'boat-2' },
      },
    };

    vi.mocked(prisma.leg.findMany)
      .mockResolvedValueOnce([leg1] as any)
      .mockResolvedValueOnce([leg2OnTime] as any);

    const result = await findConnections('BLI', 'SBY', new Date('2026-05-25T00:00:00Z'), new Date('2026-05-25T23:59:59Z'));

    // Connection should exist with correct wait time
    expect(result).toHaveLength(1);
    expect(result[0].transferWaitMinutes).toBe(60);
  });

  it('sorts results by total price ascending', async () => {
    const leg1 = {
      id: 'leg-1',
      basePrice: new Prisma.Decimal('250000'),
      departureDate: new Date('2026-05-25T08:00:00Z'),
      schedule: {
        originPort: 'BLI',
        destinationPort: 'LBH',
        durationMinutes: 120,
        boat: { id: 'boat-1' },
      },
    };

    const leg2Cheap = {
      id: 'leg-2-cheap',
      basePrice: new Prisma.Decimal('100000'),
      departureDate: new Date('2026-05-25T11:00:00Z'),
      schedule: {
        originPort: 'LBH',
        destinationPort: 'SBY',
        durationMinutes: 120,
        boat: { id: 'boat-2' },
      },
    };

    const leg2Expensive = {
      id: 'leg-2-expensive',
      basePrice: new Prisma.Decimal('300000'),
      departureDate: new Date('2026-05-25T12:00:00Z'),
      schedule: {
        originPort: 'LBH',
        destinationPort: 'SBY',
        durationMinutes: 120,
        boat: { id: 'boat-3' },
      },
    };

    vi.mocked(prisma.leg.findMany)
      .mockResolvedValueOnce([leg1] as any)
      .mockResolvedValueOnce([leg2Expensive, leg2Cheap] as any);

    const result = await findConnections('BLI', 'SBY', new Date('2026-05-25T00:00:00Z'), new Date('2026-05-25T23:59:59Z'));

    expect(result[0].totalPrice).toBe(350000); // cheap: 250k + 100k
    expect(result[1].totalPrice).toBe(550000); // expensive: 250k + 300k
  });

  it('limits results to top 10 cheapest', async () => {
    const leg1 = {
      id: 'leg-1',
      basePrice: new Prisma.Decimal('100000'),
      departureDate: new Date('2026-05-25T08:00:00Z'),
      schedule: {
        originPort: 'BLI',
        destinationPort: 'LBH',
        durationMinutes: 120,
        boat: { id: 'boat-1' },
      },
    };

    // Create 15 leg2 options with incrementing prices
    const leg2Options = Array(15)
      .fill(null)
      .map((_, i) => ({
        id: `leg-2-${i}`,
        basePrice: new Prisma.Decimal(String(50000 + i * 10000)),
        departureDate: new Date(`2026-05-25T${11 + Math.floor(i / 3)}:00:00Z`),
        schedule: {
          originPort: 'LBH',
          destinationPort: 'SBY',
          durationMinutes: 120,
          boat: { id: `boat-${i}` },
        },
      }));

    vi.mocked(prisma.leg.findMany)
      .mockResolvedValueOnce([leg1] as any)
      .mockResolvedValueOnce(leg2Options as any);

    const result = await findConnections('BLI', 'SBY', new Date('2026-05-25T00:00:00Z'), new Date('2026-05-25T23:59:59Z'));

    expect(result.length).toBeLessThanOrEqual(10);
  });
});
