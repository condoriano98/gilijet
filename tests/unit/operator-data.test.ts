import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Prisma } from '@prisma/client';
import {
  activeOperator,
  activeBoat,
  activeSchedule,
  getOperatorBoats,
  getOperatorBoat,
  getOperatorSchedules,
  getOperatorSchedule,
  getOperatorLeg,
  getOperatorLegs,
} from '@/lib/operator-data';

/**
 * Unit tests for lib/operator-data.ts
 *
 * Tests operator-scoped data queries. All queries enforce operatorId
 * to prevent cross-operator data leaks.
 *
 * Mocking: Prisma queries
 */

vi.mock('@/lib/db', () => ({
  prisma: {
    boat: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    schedule: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    leg: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    booking: {
      findMany: vi.fn(),
    },
  },
}));

// Import the mocked prisma
import { prisma } from '@/lib/db';

afterEach(() => {
  vi.clearAllMocks();
});

describe('Active entity helpers', () => {
  it('activeOperator filters deleted operators', () => {
    expect(activeOperator).toEqual({ deletedAt: null });
  });

  it('activeBoat filters deleted boats', () => {
    expect(activeBoat).toEqual({ deletedAt: null });
  });

  it('activeSchedule filters deleted schedules', () => {
    expect(activeSchedule).toEqual({ deletedAt: null });
  });
});

describe('getOperatorBoats', () => {
  beforeEach(() => {
    vi.mocked(prisma.boat.findMany).mockResolvedValue([]);
  });

  it('returns boats for operator, ordered by creation', async () => {
    const mockBoats = [
      {
        id: 'boat-1',
        operatorId: 'op-1',
        name: 'Fast Boat 1',
        capacity: 50,
        deletedAt: null,
        createdAt: new Date('2026-09-01'),
        updatedAt: new Date(),
      },
      {
        id: 'boat-2',
        operatorId: 'op-1',
        name: 'Fast Boat 2',
        capacity: 60,
        deletedAt: null,
        createdAt: new Date('2026-09-02'),
        updatedAt: new Date(),
      },
    ];

    vi.mocked(prisma.boat.findMany).mockResolvedValueOnce(mockBoats as any);

    const result = await getOperatorBoats('op-1');

    expect(prisma.boat.findMany).toHaveBeenCalledWith({
      where: { operatorId: 'op-1', deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    expect(result).toEqual(mockBoats);
  });

  it('filters deleted boats (soft-delete)', async () => {
    vi.mocked(prisma.boat.findMany).mockResolvedValueOnce([]);

    await getOperatorBoats('op-1');

    const call = vi.mocked(prisma.boat.findMany).mock.calls[0][0]!;
    expect(call.where).toEqual({ operatorId: 'op-1', deletedAt: null });
  });

  it('returns empty array when operator has no boats', async () => {
    vi.mocked(prisma.boat.findMany).mockResolvedValueOnce([]);

    const result = await getOperatorBoats('op-empty');

    expect(result).toEqual([]);
  });

  it('enforces operator tenant isolation', async () => {
    vi.mocked(prisma.boat.findMany).mockResolvedValueOnce([]);

    await getOperatorBoats('op-1');

    const call = vi.mocked(prisma.boat.findMany).mock.calls[0][0]!;
    expect(call.where).toHaveProperty('operatorId', 'op-1');
  });
});

describe('getOperatorBoat', () => {
  beforeEach(() => {
    vi.mocked(prisma.boat.findFirst).mockResolvedValue(null);
  });

  it('returns single boat for operator', async () => {
    const mockBoat = {
      id: 'boat-1',
      operatorId: 'op-1',
      name: 'Fast Boat',
      capacity: 50,
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    vi.mocked(prisma.boat.findFirst).mockResolvedValueOnce(mockBoat as any);

    const result = await getOperatorBoat('op-1', 'boat-1');

    expect(prisma.boat.findFirst).toHaveBeenCalledWith({
      where: { id: 'boat-1', operatorId: 'op-1', deletedAt: null },
    });
    expect(result).toEqual(mockBoat);
  });

  it('returns null when boat not found', async () => {
    vi.mocked(prisma.boat.findFirst).mockResolvedValueOnce(null);

    const result = await getOperatorBoat('op-1', 'nonexistent');

    expect(result).toBeNull();
  });

  it('enforces operator tenant isolation', async () => {
    vi.mocked(prisma.boat.findFirst).mockResolvedValueOnce(null);

    await getOperatorBoat('op-1', 'boat-1');

    const call = vi.mocked(prisma.boat.findFirst).mock.calls[0][0]!;
    expect(call.where).toHaveProperty('operatorId', 'op-1');
  });

  it('filters deleted boats', async () => {
    vi.mocked(prisma.boat.findFirst).mockResolvedValueOnce(null);

    await getOperatorBoat('op-1', 'boat-1');

    const call = vi.mocked(prisma.boat.findFirst).mock.calls[0][0]!;
    expect(call.where).toHaveProperty('deletedAt', null);
  });
});

describe('getOperatorSchedules', () => {
  beforeEach(() => {
    vi.mocked(prisma.schedule.findMany).mockResolvedValue([]);
  });

  it('returns schedules for operator', async () => {
    const mockSchedules = [
      {
        id: 'sched-1',
        boatId: 'boat-1',
        originPort: 'BLI',
        destinationPort: 'SBY',
        departureTime: '08:00',
        boat: { id: 'boat-1', operatorId: 'op-1' },
        _count: { legs: 10 },
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    vi.mocked(prisma.schedule.findMany).mockResolvedValueOnce(mockSchedules as any);

    const result = await getOperatorSchedules('op-1');

    expect(prisma.schedule.findMany).toHaveBeenCalledWith({
      where: {
        boat: { operatorId: 'op-1', deletedAt: null },
        deletedAt: null,
      },
      include: { boat: true, _count: { select: { legs: true } } },
      orderBy: [{ originPort: 'asc' }, { departureTime: 'asc' }],
    });
    expect(result).toEqual(mockSchedules);
  });

  it('accepts optional where filters', async () => {
    vi.mocked(prisma.schedule.findMany).mockResolvedValueOnce([]);

    await getOperatorSchedules('op-1', { originPort: 'BLI' });

    const call = vi.mocked(prisma.schedule.findMany).mock.calls[0][0]!;
    expect(call.where).toHaveProperty('originPort', 'BLI');
    expect(call.where).toHaveProperty('boat');
    expect(call.where).toHaveProperty('deletedAt', null);
  });

  it('enforces soft-delete filter on schedule and boat', async () => {
    vi.mocked(prisma.schedule.findMany).mockResolvedValueOnce([]);

    await getOperatorSchedules('op-1');

    const call = vi.mocked(prisma.schedule.findMany).mock.calls[0][0]!;
    expect(call.where).toHaveProperty('deletedAt', null);
    expect((call.where as any).boat).toHaveProperty('deletedAt', null);
  });

  it('sorts by port and time', async () => {
    vi.mocked(prisma.schedule.findMany).mockResolvedValueOnce([]);

    await getOperatorSchedules('op-1');

    const call = vi.mocked(prisma.schedule.findMany).mock.calls[0][0]!;
    expect(call.orderBy).toEqual([
      { originPort: 'asc' },
      { departureTime: 'asc' },
    ]);
  });
});

describe('getOperatorSchedule', () => {
  beforeEach(() => {
    vi.mocked(prisma.schedule.findFirst).mockResolvedValue(null);
  });

  it('returns single schedule for operator', async () => {
    const mockSchedule = {
      id: 'sched-1',
      boatId: 'boat-1',
      originPort: 'BLI',
      destinationPort: 'SBY',
      departureTime: '08:00',
      boat: { id: 'boat-1', operatorId: 'op-1', name: 'Boat' },
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    vi.mocked(prisma.schedule.findFirst).mockResolvedValueOnce(mockSchedule as any);

    const result = await getOperatorSchedule('op-1', 'sched-1');

    expect(prisma.schedule.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'sched-1',
        boat: { operatorId: 'op-1', deletedAt: null },
        deletedAt: null,
      },
      include: { boat: true },
    });
    expect(result).toEqual(mockSchedule);
  });

  it('enforces operator isolation', async () => {
    vi.mocked(prisma.schedule.findFirst).mockResolvedValueOnce(null);

    await getOperatorSchedule('op-1', 'sched-1');

    const call = vi.mocked(prisma.schedule.findFirst).mock.calls[0][0]!;
    expect((call.where as any).boat).toHaveProperty('operatorId', 'op-1');
  });
});

describe('getOperatorLeg', () => {
  beforeEach(() => {
    vi.mocked(prisma.leg.findFirst).mockResolvedValue(null);
  });

  it('returns leg with schedule and bookings', async () => {
    const mockLeg = {
      id: 'leg-1',
      operatorId: 'op-1',
      scheduleId: 'sched-1',
      status: 'OPEN',
      departureDate: new Date('2026-10-25'),
      basePrice: new Prisma.Decimal('250000'),
      schedule: {
        id: 'sched-1',
        boat: { id: 'boat-1', name: 'Boat' },
      },
      cancellationReason: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const mockBookings = [
      { id: 'booking-1', status: 'CONFIRMED', tickets: [{ id: 'ticket-1' }] },
    ];

    vi.mocked(prisma.leg.findFirst).mockResolvedValueOnce(mockLeg as any);
    vi.mocked(prisma.booking.findMany).mockResolvedValueOnce(mockBookings as any);

    const result = await getOperatorLeg('op-1', 'leg-1');

    expect(prisma.leg.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'leg-1',
        operatorId: 'op-1',
        schedule: { deletedAt: null, boat: { deletedAt: null } },
      },
      include: { schedule: { include: { boat: true } } },
    });
    expect(result).toEqual({ ...mockLeg, bookings: mockBookings });
  });

  it('only includes CONFIRMED bookings for this operator', async () => {
    vi.mocked(prisma.leg.findFirst).mockResolvedValueOnce({ id: 'leg-1' } as any);
    vi.mocked(prisma.booking.findMany).mockResolvedValueOnce([]);

    await getOperatorLeg('op-1', 'leg-1');

    const call = vi.mocked(prisma.booking.findMany).mock.calls[0][0]!;
    expect(call.where).toMatchObject({ status: 'CONFIRMED', operatorId: 'op-1' });
  });

  it('matches one-way, round-trip outbound and round-trip return bookings', async () => {
    vi.mocked(prisma.leg.findFirst).mockResolvedValueOnce({ id: 'leg-1' } as any);
    vi.mocked(prisma.booking.findMany).mockResolvedValueOnce([]);

    await getOperatorLeg('op-1', 'leg-1');

    const call = vi.mocked(prisma.booking.findMany).mock.calls[0][0]!;
    expect((call.where as any).OR).toEqual([
      { legId: 'leg-1' },
      { outboundLegId: 'leg-1' },
      { returnLegId: 'leg-1' },
    ]);
  });

  it('does not query bookings when the leg is not found', async () => {
    vi.mocked(prisma.leg.findFirst).mockResolvedValueOnce(null);

    const result = await getOperatorLeg('op-1', 'leg-1');

    expect(result).toBeNull();
    expect(prisma.booking.findMany).not.toHaveBeenCalled();
  });

  it('enforces soft-delete on schedule and boat', async () => {
    vi.mocked(prisma.leg.findFirst).mockResolvedValueOnce(null);

    await getOperatorLeg('op-1', 'leg-1');

    const call = vi.mocked(prisma.leg.findFirst).mock.calls[0][0]!;
    const where = call.where as any;
    expect(where.schedule.deletedAt).toBe(null);
    expect(where.schedule.boat.deletedAt).toBe(null);
  });
});

describe('getOperatorLegs', () => {
  beforeEach(() => {
    vi.mocked(prisma.leg.findMany).mockResolvedValue([]);
  });

  it('returns legs for operator, ordered by departure', async () => {
    const mockLegs = [
      {
        id: 'leg-1',
        operatorId: 'op-1',
        departureDate: new Date('2026-10-25'),
        status: 'OPEN',
        schedule: { id: 'sched-1', boat: { id: 'boat-1' } },
      },
    ];

    vi.mocked(prisma.leg.findMany).mockResolvedValueOnce(mockLegs as any);

    const result = await getOperatorLegs('op-1');

    expect(prisma.leg.findMany).toHaveBeenCalledWith({
      where: {
        operatorId: 'op-1',
        schedule: { deletedAt: null, boat: { deletedAt: null } },
      },
      include: { schedule: { include: { boat: true } } },
      orderBy: { departureDate: 'asc' },
      take: 200,
    });
    expect(result).toEqual(mockLegs);
  });

  it('filters by date range', async () => {
    vi.mocked(prisma.leg.findMany).mockResolvedValueOnce([]);

    const fromDate = new Date('2026-10-25');
    const toDate = new Date('2026-10-31');

    await getOperatorLegs('op-1', { fromUtc: fromDate, toUtc: toDate });

    const call = vi.mocked(prisma.leg.findMany).mock.calls[0][0]!;
    const where = call.where as any;
    expect(where.departureDate).toEqual({
      gte: fromDate,
      lte: toDate,
    });
  });

  it('filters by status', async () => {
    vi.mocked(prisma.leg.findMany).mockResolvedValueOnce([]);

    await getOperatorLegs('op-1', { status: 'SAILED' });

    const call = vi.mocked(prisma.leg.findMany).mock.calls[0][0]!;
    expect((call.where as any).status).toBe('SAILED');
  });

  it('respects custom take limit', async () => {
    vi.mocked(prisma.leg.findMany).mockResolvedValueOnce([]);

    await getOperatorLegs('op-1', { take: 50 });

    const call = vi.mocked(prisma.leg.findMany).mock.calls[0][0]!;
    expect(call.take).toBe(50);
  });

  it('defaults to take: 200', async () => {
    vi.mocked(prisma.leg.findMany).mockResolvedValueOnce([]);

    await getOperatorLegs('op-1');

    const call = vi.mocked(prisma.leg.findMany).mock.calls[0][0]!;
    expect(call.take).toBe(200);
  });

  it('enforces operator tenant isolation', async () => {
    vi.mocked(prisma.leg.findMany).mockResolvedValueOnce([]);

    await getOperatorLegs('op-1');

    const call = vi.mocked(prisma.leg.findMany).mock.calls[0][0]!;
    expect((call.where as any).operatorId).toBe('op-1');
  });
});
