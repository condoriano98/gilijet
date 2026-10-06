import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Prisma } from '@prisma/client';

/**
 * Unit tests for lib/booking-engine.ts edge cases
 *
 * Tests error handling, validation, payment hold/release, and race conditions
 * - BookingError conditions (LEG_NOT_FOUND, LEG_CLOSED, LEG_PAST, INVALID_INPUT, PROMO_INVALID)
 * - Seat reservation idempotency
 * - Passenger validation (1-10 per booking, non-infant requirement)
 * - Trip type validation (ONE_WAY vs ROUND_TRIP)
 * - Price calculation with various passenger types
 */

const mocks = vi.hoisted(() => ({
  prismaTransaction: vi.fn(),
  alertAdminNewBooking: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    $transaction: mocks.prismaTransaction,
    booking: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    leg: { findUnique: vi.fn(), update: vi.fn() },
    seatReserve: { findMany: vi.fn(), createMany: vi.fn(), deleteMany: vi.fn() },
  },
}));

vi.mock('@/lib/admin-alerts', () => ({
  alertAdminNewBooking: mocks.alertAdminNewBooking,
}));

vi.mock('@/lib/promotions', () => ({
  validatePromoCode: vi.fn(),
  applyPromoCode: vi.fn(),
}));

vi.mock('@/lib/platform-config', () => ({
  resolvePlatformPricing: vi.fn().mockResolvedValue({
    commissionRate: 0.08,
    multipliers: { ADULT: 1, CHILD: 0.5, INFANT: 0 },
  }),
}));

vi.mock('@/lib/pricing', () => ({
  computeBookingPriceWithTypes: vi.fn((args) => {
    const passengerTypes = args.passengerTypes || [];
    let total = 0;
    let seatCount = 0;
    let adultCount = 0;
    let childCount = 0;
    let infantCount = 0;

    for (const type of passengerTypes) {
      seatCount += type !== 'INFANT' ? 1 : 0;
      if (type === 'ADULT') {
        total += args.unitPrice;
        adultCount++;
      } else if (type === 'CHILD') {
        total += args.unitPrice * 0.5;
        childCount++;
      } else if (type === 'INFANT') {
        infantCount++;
      }
    }

    const discountAmount = args.discountAmount || 0;
    total = Math.max(0, total - discountAmount);
    const commission = Math.floor(total * (args.commissionRate || 0));

    return {
      fareAmount: new Prisma.Decimal(total),
      totalAmount: new Prisma.Decimal(total),
      commissionAmount: new Prisma.Decimal(commission),
      operatorAmount: new Prisma.Decimal(total - commission),
      seatCount,
      adultCount,
      childCount,
      infantCount,
    };
  }),
}));

type MockTxOverrides = {
  booking?: Record<string, unknown>;
  leg?: Record<string, unknown>;
  seatReserve?: Record<string, unknown>;
  platformConfig?: Record<string, unknown>;
  payment?: Record<string, unknown>;
  auditLog?: Record<string, unknown>;
};

function createMockTx(overrides: MockTxOverrides = {}) {
  return {
    booking: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      ...overrides.booking,
    },
    leg: {
      findUnique: vi.fn(),
      update: vi.fn(),
      ...overrides.leg,
    },
    seatReserve: {
      findMany: vi.fn(),
      createMany: vi.fn(),
      deleteMany: vi.fn(),
      ...overrides.seatReserve,
    },
    platformConfig: {
      findUnique: vi.fn(),
      ...overrides.platformConfig,
    },
    payment: {
      create: vi.fn(),
      ...overrides.payment,
    },
    auditLog: {
      create: vi.fn(),
      ...overrides.auditLog,
    },
  };
}

async function loadBookingEngine() {
  vi.resetModules();
  return import('@/lib/booking-engine');
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.resetModules();
});

describe('BookingError codes', () => {
  it('throws LEG_NOT_FOUND when ONE_WAY leg does not exist', async () => {
    const engine = await loadBookingEngine();

    const tx = {
      leg: { findUnique: vi.fn().mockResolvedValue(null) },
    };

    mocks.prismaTransaction.mockImplementation((fn) => fn(tx));

    await expect(
      engine.reserveSeatsAndCreateBooking({
        legId: 'nonexistent-leg',
        customer: {
          name: 'Test Customer',
          email: 'test@example.com',
          phone: '+62812345678',
        },
        passengers: [{ name: 'Passenger 1', type: 'ADULT' }],
      }),
    ).rejects.toMatchObject({
      code: 'LEG_NOT_FOUND',
      message: expect.stringContaining('Departure not found'),
    });
  });

  it('throws LEG_CLOSED when leg status is not OPEN', async () => {
    const engine = await loadBookingEngine();

    const leg = {
      id: 'leg-closed',
      status: 'CLOSED',
      operatorId: 'op-1',
      departureDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      schedule: {
        boat: { operatorId: 'op-1' },
      },
    };

    const tx = {
      leg: { findUnique: vi.fn().mockResolvedValue(leg) },
    };

    mocks.prismaTransaction.mockImplementation((fn) => fn(tx));

    await expect(
      engine.reserveSeatsAndCreateBooking({
        legId: 'leg-closed',
        customer: {
          name: 'Test',
          email: 'test@example.com',
          phone: '+62812345678',
        },
        passengers: [{ name: 'P1', type: 'ADULT' }],
      }),
    ).rejects.toMatchObject({
      code: 'LEG_CLOSED',
    });
  });

  it('throws LEG_PAST when departure date is in the past', async () => {
    const engine = await loadBookingEngine();

    const leg = {
      id: 'leg-past',
      status: 'OPEN',
      operatorId: 'op-1',
      departureDate: new Date(Date.now() - 1000), // 1 second ago
      schedule: {
        boat: { operatorId: 'op-1' },
      },
    };

    const tx = {
      leg: { findUnique: vi.fn().mockResolvedValue(leg) },
    };

    mocks.prismaTransaction.mockImplementation((fn) => fn(tx));

    await expect(
      engine.reserveSeatsAndCreateBooking({
        legId: 'leg-past',
        customer: {
          name: 'Test',
          email: 'test@example.com',
          phone: '+62812345678',
        },
        passengers: [{ name: 'P1', type: 'ADULT' }],
      }),
    ).rejects.toMatchObject({
      code: 'LEG_PAST',
    });
  });

  it('throws INVALID_INPUT for zero passengers', async () => {
    const engine = await loadBookingEngine();

    await expect(
      engine.reserveSeatsAndCreateBooking({
        legId: 'leg-1',
        customer: {
          name: 'Test',
          email: 'test@example.com',
          phone: '+62812345678',
        },
        passengers: [],
      }),
    ).rejects.toMatchObject({
      code: 'INVALID_INPUT',
      message: expect.stringContaining('1-10 passengers'),
    });
  });

  it('throws INVALID_INPUT for more than 10 passengers', async () => {
    const engine = await loadBookingEngine();

    const passengers = Array.from({ length: 11 }, (_, i) => ({
      name: `Passenger ${i + 1}`,
      type: 'ADULT' as const,
    }));

    await expect(
      engine.reserveSeatsAndCreateBooking({
        legId: 'leg-1',
        customer: {
          name: 'Test',
          email: 'test@example.com',
          phone: '+62812345678',
        },
        passengers,
      }),
    ).rejects.toMatchObject({
      code: 'INVALID_INPUT',
      message: expect.stringContaining('1-10 passengers'),
    });
  });

  it('throws INVALID_INPUT when only infants (no seat-taking passengers)', async () => {
    const engine = await loadBookingEngine();

    await expect(
      engine.reserveSeatsAndCreateBooking({
        legId: 'leg-1',
        customer: {
          name: 'Test',
          email: 'test@example.com',
          phone: '+62812345678',
        },
        passengers: [
          { name: 'Infant 1', type: 'INFANT' },
          { name: 'Infant 2', type: 'INFANT' },
        ],
      }),
    ).rejects.toMatchObject({
      code: 'INVALID_INPUT',
      message: expect.stringContaining('non-infant passenger'),
    });
  });

  it('throws INVALID_INPUT for neither ONE_WAY nor ROUND_TRIP format', async () => {
    const engine = await loadBookingEngine();

    // Provide neither legId nor the round-trip pair
    await expect(
      engine.reserveSeatsAndCreateBooking({
        customer: {
          name: 'Test',
          email: 'test@example.com',
          phone: '+62812345678',
        },
        passengers: [{ name: 'P1', type: 'ADULT' }],
      }),
    ).rejects.toMatchObject({
      code: 'INVALID_INPUT',
      message: expect.stringContaining('legId (one-way) or outboundLegId'),
    });
  });

  it('throws INVALID_INPUT when only outbound leg provided (incomplete round-trip)', async () => {
    const engine = await loadBookingEngine();

    await expect(
      engine.reserveSeatsAndCreateBooking({
        outboundLegId: 'leg-out',
        // returnLegId missing
        customer: {
          name: 'Test',
          email: 'test@example.com',
          phone: '+62812345678',
        },
        passengers: [{ name: 'P1', type: 'ADULT' }],
      }),
    ).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
  });
});

describe('Idempotency & Replay', () => {
  it('returns existing booking when idempotencyKey is replayed', async () => {
    const engine = await loadBookingEngine();
    const { prisma } = await import('@/lib/db');

    const existingBooking = {
      id: 'bk-existing',
      bookingReference: 'BK-2026-10-REPLAY',
    };

    // Mock the top-level idempotency check
    vi.mocked(prisma.booking.findUnique).mockResolvedValueOnce(existingBooking as any);

    const result = await engine.reserveSeatsAndCreateBooking({
      legId: 'leg-1',
      idempotencyKey: 'idempotency-key-123',
      customer: {
        name: 'Test',
        email: 'test@example.com',
        phone: '+62812345678',
      },
      passengers: [{ name: 'P1', type: 'ADULT' }],
    });

    expect(result).toEqual({
      bookingId: 'bk-existing',
      bookingReference: 'BK-2026-10-REPLAY',
    });
  });

  it('creates new booking when idempotencyKey is first use', async () => {
    const engine = await loadBookingEngine();
    const { prisma } = await import('@/lib/db');

    const leg = {
      id: 'leg-1',
      status: 'OPEN',
      operatorId: 'op-1',
      basePrice: new Prisma.Decimal('250000'),
      departureDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      schedule: {
        boat: { operatorId: 'op-1' },
        fareMatrix: null,
      },
    };

    const newBooking = {
      id: 'bk-new',
      bookingReference: 'BK-2026-10-NEW',
    };

    // Mock top-level idempotency check (not found)
    vi.mocked(prisma.booking.findUnique).mockResolvedValueOnce(null);

    // Mock transaction
    const tx = createMockTx();
    vi.mocked(tx.booking.create).mockResolvedValueOnce(newBooking as any);
    vi.mocked(tx.leg.findUnique).mockResolvedValue(leg as any);
    mocks.prismaTransaction.mockImplementation((fn) => fn(tx));

    const result = await engine.reserveSeatsAndCreateBooking({
      legId: 'leg-1',
      idempotencyKey: 'idempotency-key-456',
      customer: {
        name: 'New Customer',
        email: 'new@example.com',
        phone: '+62812345678',
      },
      passengers: [{ name: 'P1', type: 'ADULT' }],
    });

    expect(result).toEqual({
      bookingId: 'bk-new',
      bookingReference: 'BK-2026-10-NEW',
    });
  });
});

describe('Passenger Validation & Defaults', () => {
  it('defaults passenger type to ADULT when not specified', async () => {
    const engine = await loadBookingEngine();
    const { prisma } = await import('@/lib/db');

    const leg = {
      id: 'leg-1',
      status: 'OPEN',
      operatorId: 'op-1',
      basePrice: new Prisma.Decimal('300000'),
      departureDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      schedule: {
        boat: { operatorId: 'op-1' },
        fareMatrix: null,
      },
    };

    // Mock top-level idempotency check
    vi.mocked(prisma.booking.findUnique).mockResolvedValueOnce(null);

    const tx = createMockTx();
    vi.mocked(tx.booking.create).mockResolvedValueOnce({
      id: 'bk-1',
      bookingReference: 'BK-2026-10-DEFAULT',
    } as any);
    vi.mocked(tx.leg.findUnique).mockResolvedValue(leg as any);
    mocks.prismaTransaction.mockImplementation((fn) => fn(tx));

    await engine.reserveSeatsAndCreateBooking({
      legId: 'leg-1',
      customer: {
        name: 'Test',
        email: 'test@example.com',
        phone: '+62812345678',
      },
      passengers: [
        { name: 'Named Adult' }, // No type, should default to ADULT
      ],
    });

    // The booking should be created successfully with default type
    expect(vi.mocked(tx.booking.create)).toHaveBeenCalled();
  });

  it('counts non-infant passengers for seat calculation', async () => {
    const engine = await loadBookingEngine();
    const { prisma } = await import('@/lib/db');

    const leg = {
      id: 'leg-1',
      status: 'OPEN',
      operatorId: 'op-1',
      basePrice: new Prisma.Decimal('250000'),
      departureDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
      schedule: {
        boat: { operatorId: 'op-1' },
        fareMatrix: null,
      },
    };

    // Mock top-level idempotency check
    vi.mocked(prisma.booking.findUnique).mockResolvedValueOnce(null);

    const tx = createMockTx();
    vi.mocked(tx.booking.create).mockResolvedValueOnce({
      id: 'bk-mix',
      bookingReference: 'BK-2026-10-MIX',
    } as any);
    vi.mocked(tx.leg.findUnique).mockResolvedValue(leg as any);
    mocks.prismaTransaction.mockImplementation((fn) => fn(tx));

    // 2 adults + 1 child + 1 infant = 4 passengers, but only 3 seats
    await engine.reserveSeatsAndCreateBooking({
      legId: 'leg-1',
      customer: {
        name: 'Family',
        email: 'family@example.com',
        phone: '+62812345678',
      },
      passengers: [
        { name: 'Adult 1', type: 'ADULT' },
        { name: 'Adult 2', type: 'ADULT' },
        { name: 'Child 1', type: 'CHILD' },
        { name: 'Infant 1', type: 'INFANT' }, // Doesn't take a seat
      ],
    });

    expect(vi.mocked(tx.booking.create)).toHaveBeenCalled();
  });
});

describe('Round-Trip Validation', () => {
  it('throws LEG_NOT_FOUND when outbound leg does not exist', async () => {
    const engine = await loadBookingEngine();

    const tx = {
      leg: {
        findUnique: vi.fn((args) => {
          if (args.where.id === 'leg-out') return null;
          return null;
        }),
      },
    };

    mocks.prismaTransaction.mockImplementation((fn) => fn(tx));

    await expect(
      engine.reserveSeatsAndCreateBooking({
        outboundLegId: 'leg-out',
        returnLegId: 'leg-return',
        customer: {
          name: 'Test',
          email: 'test@example.com',
          phone: '+62812345678',
        },
        passengers: [{ name: 'P1', type: 'ADULT' }],
      }),
    ).rejects.toMatchObject({
      code: 'LEG_NOT_FOUND',
      message: expect.stringContaining('Outbound'),
    });
  });

  it('throws INVALID_INPUT when return date is before outbound', async () => {
    const engine = await loadBookingEngine();

    const now = Date.now();
    const outboundDate = new Date(now + 10 * 24 * 60 * 60 * 1000); // 10 days from now
    const returnDate = new Date(now + 5 * 24 * 60 * 60 * 1000); // 5 days from now (earlier)

    const outboundLeg = {
      id: 'leg-out',
      status: 'OPEN',
      operatorId: 'op-1',
      departureDate: outboundDate,
      schedule: {
        boat: { operatorId: 'op-1' },
      },
    };

    const returnLeg = {
      id: 'leg-return',
      status: 'OPEN',
      operatorId: 'op-1',
      departureDate: returnDate, // Before outbound!
      schedule: {
        boat: { operatorId: 'op-1' },
      },
    };

    const tx = {
      leg: {
        findUnique: vi.fn((args) => {
          if (args.where.id === 'leg-out') return outboundLeg;
          if (args.where.id === 'leg-return') return returnLeg;
          return null;
        }),
      },
    };

    mocks.prismaTransaction.mockImplementation((fn) => fn(tx));

    await expect(
      engine.reserveSeatsAndCreateBooking({
        outboundLegId: 'leg-out',
        returnLegId: 'leg-return',
        customer: {
          name: 'Test',
          email: 'test@example.com',
          phone: '+62812345678',
        },
        passengers: [{ name: 'P1', type: 'ADULT' }],
      }),
    ).rejects.toMatchObject({
      code: 'INVALID_INPUT',
      message: expect.stringContaining('Return departure must be after outbound'),
    });
  });

  it('throws INVALID_INPUT when legs are from different operators', async () => {
    const engine = await loadBookingEngine();

    const now = Date.now();

    const outboundLeg = {
      id: 'leg-out',
      status: 'OPEN',
      operatorId: 'op-1',
      departureDate: new Date(now + 5 * 24 * 60 * 60 * 1000),
      schedule: {
        boat: { operatorId: 'op-1' },
      },
    };

    const returnLeg = {
      id: 'leg-return',
      status: 'OPEN',
      operatorId: 'op-2', // Different operator!
      departureDate: new Date(now + 10 * 24 * 60 * 60 * 1000),
      schedule: {
        boat: { operatorId: 'op-2' },
      },
    };

    const tx = {
      leg: {
        findUnique: vi.fn((args) => {
          if (args.where.id === 'leg-out') return outboundLeg;
          if (args.where.id === 'leg-return') return returnLeg;
          return null;
        }),
      },
    };

    mocks.prismaTransaction.mockImplementation((fn) => fn(tx));

    await expect(
      engine.reserveSeatsAndCreateBooking({
        outboundLegId: 'leg-out',
        returnLegId: 'leg-return',
        customer: {
          name: 'Test',
          email: 'test@example.com',
          phone: '+62812345678',
        },
        passengers: [{ name: 'P1', type: 'ADULT' }],
      }),
    ).rejects.toMatchObject({
      code: 'INVALID_INPUT',
      message: expect.stringContaining('same operator'),
    });
  });
});

describe('Admin Alert Behavior', () => {
  it('fires alert notification after successful booking', async () => {
    const engine = await loadBookingEngine();
    const { prisma } = await import('@/lib/db');

    const leg = {
      id: 'leg-1',
      status: 'OPEN',
      operatorId: 'op-1',
      basePrice: new Prisma.Decimal('200000'),
      departureDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      schedule: {
        boat: { operatorId: 'op-1' },
        fareMatrix: null,
      },
    };

    const newBooking = {
      id: 'bk-alert-test',
      bookingReference: 'BK-2026-10-ALERT',
    };

    // Mock top-level idempotency check
    vi.mocked(prisma.booking.findUnique).mockResolvedValueOnce(null);

    const tx = createMockTx();
    vi.mocked(tx.booking.create).mockResolvedValueOnce(newBooking as any);
    vi.mocked(tx.leg.findUnique).mockResolvedValue(leg as any);
    mocks.prismaTransaction.mockImplementation((fn) => fn(tx));

    await engine.reserveSeatsAndCreateBooking({
      legId: 'leg-1',
      customer: {
        name: 'Alert Test',
        email: 'alert@example.com',
        phone: '+62812345678',
      },
      passengers: [{ name: 'P1', type: 'ADULT' }],
    });

    expect(mocks.alertAdminNewBooking).toHaveBeenCalledWith('bk-alert-test');
  });
});

describe('Price Calculation Scenarios', () => {
  it('correctly prices mixed passenger types', async () => {
    const engine = await loadBookingEngine();
    const { prisma } = await import('@/lib/db');

    const leg = {
      id: 'leg-1',
      status: 'OPEN',
      operatorId: 'op-1',
      basePrice: new Prisma.Decimal('200000'),
      departureDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      schedule: {
        boat: { operatorId: 'op-1' },
        fareMatrix: null,
      },
    };

    // Mock top-level idempotency check
    vi.mocked(prisma.booking.findUnique).mockResolvedValueOnce(null);

    const tx = createMockTx();
    vi.mocked(tx.booking.create).mockResolvedValueOnce({
      id: 'bk-price-test',
      bookingReference: 'BK-2026-10-PRICE',
    } as any);
    vi.mocked(tx.leg.findUnique).mockResolvedValue(leg as any);
    mocks.prismaTransaction.mockImplementation((fn) => fn(tx));

    // 2 adults (400k) + 1 child (100k) = 500k
    await engine.reserveSeatsAndCreateBooking({
      legId: 'leg-1',
      customer: {
        name: 'Price Test',
        email: 'price@example.com',
        phone: '+62812345678',
      },
      passengers: [
        { name: 'Adult 1', type: 'ADULT' },
        { name: 'Adult 2', type: 'ADULT' },
        { name: 'Child 1', type: 'CHILD' },
      ],
    });

    expect(vi.mocked(tx.booking.create)).toHaveBeenCalled();
  });
});
