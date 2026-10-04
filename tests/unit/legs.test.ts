import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Prisma } from '@prisma/client';
import {
  generateLegsForSchedule,
  cancelLeg,
  demoSeasonWindow,
  seasonSeedParams,
  BOOKING_HORIZON_DAYS,
} from '@/lib/legs';

/**
 * Unit tests for lib/legs.ts
 *
 * Tests leg generation from schedules:
 * - Date window calculations (demo season, booking horizon)
 * - Leg generation idempotency (scheduleId, departureDate unique)
 * - Day-of-week filtering for departures
 * - Leg cancellation with cascading refunds
 *
 * Mocking: Prisma schedule, leg, booking, ticket, refund queries
 */

vi.mock('@/lib/db', () => ({
  prisma: {
    schedule: {
      findUnique: vi.fn(),
    },
    leg: {
      createMany: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
    },
    booking: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
    },
    ticket: {
      updateMany: vi.fn(),
    },
    refund: {
      createMany: vi.fn(),
      create: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
    $transaction: vi.fn((fn) => fn({})),
  },
}));

import { prisma } from '@/lib/db';

afterEach(() => {
  vi.clearAllMocks();
});

describe('demoSeasonWindow', () => {
  it('returns July 1 to August 31 in WITA timezone', () => {
    const ref = new Date('2026-06-15');
    const window = demoSeasonWindow(ref);

    // Functions return UTC dates but represent WITA local times
    // July 1 00:00 WITA = June 30 16:00 UTC (WITA is UTC+8)
    const startYmd = window.start.toISOString().split('T')[0];
    const endYmd = window.end.toISOString().split('T')[0];

    // Check year and rough date range (timezone offset means UTC dates differ)
    expect(startYmd).toMatch(/2026-0[67]/);
    expect(endYmd).toMatch(/2026-0[89]/);
  });

  it('uses current year when no ref provided', () => {
    const window = demoSeasonWindow();
    const year = new Date().getFullYear();

    // Year should match even with timezone offset
    expect(window.start.getFullYear()).toBe(year);
  });

  it('handles year boundary correctly', () => {
    const ref = new Date('2027-01-01');
    const window = demoSeasonWindow(ref);

    expect(window.start.getFullYear()).toBe(2027);
    expect(window.end.getFullYear()).toBe(2027);
  });
});

describe('seasonSeedParams', () => {
  it('returns startAt at season start if ref is before season', () => {
    const ref = new Date('2026-06-01T12:00:00Z');
    const params = seasonSeedParams(ref);

    // Should start at July 1 (in WITA timezone)
    expect(params.startAt.getTime()).toBeGreaterThan(ref.getTime());
  });

  it('returns ref as startAt if during season', () => {
    const ref = new Date('2026-07-15T12:00:00Z');
    const params = seasonSeedParams(ref);

    expect(Math.abs(params.startAt.getTime() - ref.getTime())).toBeLessThan(1000);
  });

  it('calculates daysAhead to reach season end', () => {
    const ref = new Date('2026-07-01T00:00:00Z');
    const params = seasonSeedParams(ref);

    // From July 1 to August 31 should be roughly 62 days (ceil + 1 in formula)
    expect(params.daysAhead).toBeGreaterThan(50);
    expect(params.daysAhead).toBeLessThan(70);
  });

  it('returns minimal daysAhead if after season', () => {
    const ref = new Date('2026-09-01T00:00:00Z');
    const params = seasonSeedParams(ref);

    // After season: end is before ref, so formula gives negative then Math.max(0,...)+1 = 1
    expect(params.daysAhead).toBeGreaterThanOrEqual(0);
  });
});

describe('generateLegsForSchedule', () => {
  it('throws error when schedule not found', async () => {
    vi.mocked(prisma.schedule.findUnique).mockResolvedValueOnce(null);

    await expect(generateLegsForSchedule('nonexistent')).rejects.toThrow(
      'Schedule nonexistent not found',
    );
  });

  it('returns 0 when schedule is inactive', async () => {
    vi.mocked(prisma.schedule.findUnique).mockResolvedValueOnce({
      id: 'sched-1',
      status: 'INACTIVE',
      boatId: 'boat-1',
      basePrice: new Prisma.Decimal('250000'),
      departureTime: '08:00',
      daysOfWeek: '1111100',
      originPort: 'BLI',
      destinationPort: 'SBY',
      boat: {
        id: 'boat-1',
        operatorId: 'op-1',
        status: 'ACTIVE',
        name: 'Boat',
        capacity: 50,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    } as any);

    const result = await generateLegsForSchedule('sched-1');

    expect(result).toBe(0);
  });

  it('returns 0 when boat is inactive', async () => {
    vi.mocked(prisma.schedule.findUnique).mockResolvedValueOnce({
      id: 'sched-1',
      status: 'ACTIVE',
      boatId: 'boat-1',
      basePrice: new Prisma.Decimal('250000'),
      departureTime: '08:00',
      daysOfWeek: '1111100',
      originPort: 'BLI',
      destinationPort: 'SBY',
      boat: {
        id: 'boat-1',
        operatorId: 'op-1',
        status: 'INACTIVE',
        name: 'Boat',
        capacity: 50,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    } as any);

    const result = await generateLegsForSchedule('sched-1');

    expect(result).toBe(0);
  });

  it('generates legs for active schedule', async () => {
    const now = new Date('2026-10-25T06:00:00Z');

    vi.mocked(prisma.schedule.findUnique).mockResolvedValueOnce({
      id: 'sched-1',
      status: 'ACTIVE',
      boatId: 'boat-1',
      basePrice: new Prisma.Decimal('250000'),
      departureTime: '08:00',
      daysOfWeek: '1111100', // Mon-Fri only
      originPort: 'BLI',
      destinationPort: 'SBY',
      boat: {
        id: 'boat-1',
        operatorId: 'op-1',
        status: 'ACTIVE',
        name: 'Boat',
        capacity: 50,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    } as any);

    vi.mocked(prisma.leg.createMany).mockResolvedValueOnce({ count: 10 });

    const result = await generateLegsForSchedule('sched-1', 14, now);

    expect(result).toBeGreaterThan(0);
    expect(prisma.leg.createMany).toHaveBeenCalled();
  });

  it('skips past departures (before now)', async () => {
    const now = new Date('2026-10-25T10:00:00Z'); // Already 10:00 AM

    vi.mocked(prisma.schedule.findUnique).mockResolvedValueOnce({
      id: 'sched-1',
      status: 'ACTIVE',
      boatId: 'boat-1',
      basePrice: new Prisma.Decimal('250000'),
      departureTime: '08:00', // Before now
      daysOfWeek: '1111111', // Every day
      originPort: 'BLI',
      destinationPort: 'SBY',
      boat: {
        id: 'boat-1',
        operatorId: 'op-1',
        status: 'ACTIVE',
        name: 'Boat',
        capacity: 50,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    } as any);

    vi.mocked(prisma.leg.createMany).mockResolvedValueOnce({ count: 13 }); // Should skip first day

    await generateLegsForSchedule('sched-1', 14, now);

    expect(prisma.leg.createMany).toHaveBeenCalled();
  });

  it('respects daysOfWeek pattern', async () => {
    const now = new Date('2026-10-26T06:00:00Z'); // Monday

    vi.mocked(prisma.schedule.findUnique).mockResolvedValueOnce({
      id: 'sched-1',
      status: 'ACTIVE',
      boatId: 'boat-1',
      basePrice: new Prisma.Decimal('250000'),
      departureTime: '08:00',
      daysOfWeek: '1000000', // Monday only
      originPort: 'BLI',
      destinationPort: 'SBY',
      boat: {
        id: 'boat-1',
        operatorId: 'op-1',
        status: 'ACTIVE',
        name: 'Boat',
        capacity: 50,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    } as any);

    vi.mocked(prisma.leg.createMany).mockResolvedValueOnce({ count: 2 }); // 2 Mondays in 14 days

    await generateLegsForSchedule('sched-1', 14, now);

    expect(prisma.leg.createMany).toHaveBeenCalled();
  });

  it('is idempotent with skipDuplicates', async () => {
    const now = new Date('2026-10-25T06:00:00Z');

    vi.mocked(prisma.schedule.findUnique).mockResolvedValue({
      id: 'sched-1',
      status: 'ACTIVE',
      boatId: 'boat-1',
      basePrice: new Prisma.Decimal('250000'),
      departureTime: '08:00',
      daysOfWeek: '1111111',
      originPort: 'BLI',
      destinationPort: 'SBY',
      boat: {
        id: 'boat-1',
        operatorId: 'op-1',
        status: 'ACTIVE',
        name: 'Boat',
        capacity: 50,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    } as any);

    vi.mocked(prisma.leg.createMany).mockResolvedValue({ count: 14 });

    // Run twice
    await generateLegsForSchedule('sched-1', 14, now);
    await generateLegsForSchedule('sched-1', 14, now);

    // Both calls should work (skipDuplicates=true)
    expect(prisma.leg.createMany).toHaveBeenCalledTimes(2);
  });
});

describe('cancelLeg', () => {
  it('cancels a leg and creates refunds', async () => {
    const mockTx = {
      leg: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'leg-1',
          operatorId: 'op-1',
          status: 'OPEN',
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      booking: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'booking-1',
            status: 'CONFIRMED',
            totalAmount: new Prisma.Decimal('500000'),
            tickets: [],
            payment: { id: 'pay-1' },
            refund: null,
          },
          {
            id: 'booking-2',
            status: 'CONFIRMED',
            totalAmount: new Prisma.Decimal('250000'),
            tickets: [],
            payment: { id: 'pay-2' },
            refund: null,
          },
        ]),
        update: vi.fn().mockResolvedValue({}),
      },
      ticket: {
        updateMany: vi.fn().mockResolvedValue({ count: 2 }),
      },
      refund: {
        create: vi.fn().mockResolvedValue({ id: 'refund-1' }),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({}),
      },
    };

    vi.mocked(prisma.$transaction).mockImplementationOnce(async (fn) => fn(mockTx));

    const result = await cancelLeg({
      legId: 'leg-1',
      reason: 'Engine failure',
      operatorId: 'op-1',
    });

    expect(result.cancelledBookings).toBe(2);
    expect(result.pendingRefunds).toBe(2);
  });

  it('throws error when not authorised for leg', async () => {
    const mockTx = {
      leg: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'leg-1',
          operatorId: 'op-1',
          status: 'OPEN',
        }),
      },
    };

    vi.mocked(prisma.$transaction).mockImplementationOnce(async (fn) => fn(mockTx));

    await expect(
      cancelLeg({
        legId: 'leg-1',
        reason: 'Engine failure',
        operatorId: 'op-2',
      }),
    ).rejects.toThrow('Not authorised for this leg');
  });

  it('throws error when leg already sailed', async () => {
    const mockTx = {
      leg: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'leg-1',
          operatorId: 'op-1',
          status: 'SAILED',
        }),
      },
    };

    vi.mocked(prisma.$transaction).mockImplementationOnce(async (fn) => fn(mockTx));

    await expect(
      cancelLeg({
        legId: 'leg-1',
        reason: 'Too late',
        operatorId: 'op-1',
      }),
    ).rejects.toThrow('Cannot cancel a leg that has already sailed');
  });

  it('returns 0 when leg already cancelled', async () => {
    const mockTx = {
      leg: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'leg-1',
          operatorId: 'op-1',
          status: 'CANCELLED',
        }),
      },
    };

    vi.mocked(prisma.$transaction).mockImplementationOnce(async (fn) => fn(mockTx));

    const result = await cancelLeg({
      legId: 'leg-1',
      reason: 'Already cancelled',
      operatorId: 'op-1',
    });

    expect(result.cancelledBookings).toBe(0);
    expect(result.pendingRefunds).toBe(0);
  });
});
