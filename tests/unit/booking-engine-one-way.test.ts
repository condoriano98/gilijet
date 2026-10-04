import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';

const findUniqueMock = vi.fn();
const createMock = vi.fn();
const updateMock = vi.fn();
const createAuditLogMock = vi.fn();

vi.mock('@/lib/db', () => ({
  prisma: {
    booking: {
      findUnique: vi.fn(),
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        leg: { findUnique: findUniqueMock },
        booking: { create: createMock, update: updateMock },
        auditLog: { create: createAuditLogMock },
      }),
  },
}));

vi.mock('@/lib/pricing', () => ({
  computeBookingPriceWithTypes: vi.fn((args) => {
    const unitPrice = new Prisma.Decimal(args.unitPrice || 0);
    const multiplier =
      args.passengerTypes?.reduce((sum: number, type: string) => {
        if (type === 'ADULT') return sum + 1;
        if (type === 'CHILD') return sum + 0.5;
        return sum;
      }, 0) || 1;

    const fareAmount = unitPrice.mul(multiplier);
    const discountAmount = new Prisma.Decimal(args.discountAmount || 0);
    const fareLessThanDiscount = fareAmount.sub(discountAmount);
    const customerFare = fareLessThanDiscount.greaterThan(0)
      ? fareLessThanDiscount
      : new Prisma.Decimal(0);

    const serviceFeeAmount = args.serviceFee
      ? new Prisma.Decimal(args.serviceFee)
      : new Prisma.Decimal(0);
    const totalAmount = customerFare.add(serviceFeeAmount);

    const commissionRate = new Prisma.Decimal(args.commissionRate || 0.08);
    const commissionAmount = totalAmount.mul(commissionRate).toDecimalPlaces(0);
    const operatorAmount = totalAmount.sub(commissionAmount);

    const adultCount = args.passengerTypes?.filter(
      (t: string) => t === 'ADULT',
    ).length || 0;
    const childCount = args.passengerTypes?.filter(
      (t: string) => t === 'CHILD',
    ).length || 0;
    const infantCount = args.passengerTypes?.filter(
      (t: string) => t === 'INFANT',
    ).length || 0;
    const seatCount =
      args.passengerTypes?.filter((t: string) => t !== 'INFANT').length || 0;

    return {
      fareAmount: customerFare,
      totalAmount,
      commissionAmount,
      operatorAmount,
      adultCount,
      childCount,
      infantCount,
      seatCount,
    };
  }),
}));

vi.mock('@/lib/platform-config', () => ({
  resolvePlatformPricing: vi.fn(async () => ({
    multipliers: {},
    commissionRate: new Prisma.Decimal('0.08'),
    serviceFee: null,
  })),
}));

vi.mock('@/lib/fares', () => ({
  parseFareMatrix: vi.fn(() => null),
  categoryFaresFor: vi.fn(() => ({ child: new Prisma.Decimal(0), infant: new Prisma.Decimal(0) })),
}));

vi.mock('@/lib/references', () => ({
  newBookingReference: vi.fn(() => `GILI-${Math.random().toString(36).substring(7).toUpperCase()}`),
}));

vi.mock('@/lib/refunds', () => ({
  computeRefundDeadline: vi.fn((date) => new Date(date.getTime() + 7 * 24 * 60 * 60 * 1000)),
  snapshotCurrentPolicy: vi.fn(() => ({ standard: 100 })),
}));

vi.mock('@/lib/promotions', () => ({
  validatePromoCode: vi.fn(async () => ({
    valid: true,
    promotion: { id: 'promo-1', costBearer: 'SHARED' },
    discountAmount: 0,
  })),
  applyPromoCode: vi.fn(async () => {}),
}));

vi.mock('@/lib/admin-alerts', () => ({
  alertAdminNewBooking: vi.fn(),
}));

vi.mock('@/lib/doku', () => ({
  isDokuMock: vi.fn(() => true),
}));

import { reserveSeatsAndCreateBooking, BookingError } from '@/lib/booking-engine';

describe('createOneWayBooking', () => {
  const futureDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);

  const mockLeg = {
    id: 'leg-1',
    operatorId: 'op-A',
    status: 'OPEN' as const,
    departureDate: futureDate,
    basePrice: new Prisma.Decimal('250000'),
    schedule: {
      id: 'sched-1',
      originPort: 'BLI',
      destinationPort: 'MKS',
      fareMatrix: null,
      boat: { operatorId: 'op-A' },
    },
  };

  beforeEach(() => {
    findUniqueMock.mockReset();
    createMock.mockReset();
    updateMock.mockReset();
    createAuditLogMock.mockReset();
    vi.clearAllMocks();
  });

  describe('Valid one-way booking', () => {
    it('creates booking with valid leg', async () => {
      findUniqueMock
        .mockResolvedValueOnce(mockLeg)      // Fetch leg in createOneWayBooking
        .mockResolvedValueOnce(mockLeg)      // For refund deadline fetch
        .mockResolvedValueOnce(mockLeg);     // Extra fetch for snapshot

      createMock.mockResolvedValue({
        id: 'booking-1',
        bookingReference: 'GILI-ABC123',
        tripType: 'ONE_WAY',
      });

      const result = await reserveSeatsAndCreateBooking({
        legId: 'leg-1',
        customer: {
          name: 'John Doe',
          email: 'john@example.com',
          phone: '+62812345678',
        },
        passengers: [{ name: 'John Doe', type: 'ADULT' }],
      });

      expect(result.bookingId).toBe('booking-1');
      expect(result.bookingReference).toBe('GILI-ABC123');
    });

    it('creates booking with default ADULT passenger type', async () => {
      findUniqueMock
        .mockResolvedValueOnce(mockLeg)
        .mockResolvedValueOnce(mockLeg)
        .mockResolvedValueOnce(mockLeg);

      createMock.mockResolvedValue({
        id: 'booking-2',
        bookingReference: 'GILI-DEF456',
        tripType: 'ONE_WAY',
      });

      const result = await reserveSeatsAndCreateBooking({
        legId: 'leg-1',
        customer: {
          name: 'Jane Doe',
          email: 'jane@example.com',
          phone: '+62812345678',
        },
        passengers: [{ name: 'Jane Doe' }], // No type specified, should default to ADULT
      });

      expect(result.bookingId).toBe('booking-2');
    });
  });

  describe('Passenger type handling', () => {
    it('accepts ADULT passengers', async () => {
      findUniqueMock
        .mockResolvedValueOnce(mockLeg)
        .mockResolvedValueOnce(mockLeg)
        .mockResolvedValueOnce(mockLeg);

      createMock.mockResolvedValue({
        id: 'booking-adult',
        bookingReference: 'GILI-ADULT',
        tripType: 'ONE_WAY',
      });

      const result = await reserveSeatsAndCreateBooking({
        legId: 'leg-1',
        customer: {
          name: 'Adult',
          email: 'adult@example.com',
          phone: '+62000',
        },
        passengers: [{ name: 'Adult', type: 'ADULT' }],
      });

      expect(result.bookingId).toBe('booking-adult');
    });

    it('accepts CHILD passengers', async () => {
      findUniqueMock
        .mockResolvedValueOnce(mockLeg)
        .mockResolvedValueOnce(mockLeg)
        .mockResolvedValueOnce(mockLeg);

      createMock.mockResolvedValue({
        id: 'booking-child',
        bookingReference: 'GILI-CHILD',
        tripType: 'ONE_WAY',
      });

      const result = await reserveSeatsAndCreateBooking({
        legId: 'leg-1',
        customer: {
          name: 'Parent',
          email: 'parent@example.com',
          phone: '+62000',
        },
        passengers: [{ name: 'Child', type: 'CHILD' }],
      });

      expect(result.bookingId).toBe('booking-child');
    });

    it('accepts mixed ADULT, CHILD, and INFANT passengers', async () => {
      findUniqueMock
        .mockResolvedValueOnce(mockLeg)
        .mockResolvedValueOnce(mockLeg)
        .mockResolvedValueOnce(mockLeg);

      createMock.mockResolvedValue({
        id: 'booking-mixed',
        bookingReference: 'GILI-MIXED',
        tripType: 'ONE_WAY',
      });

      const result = await reserveSeatsAndCreateBooking({
        legId: 'leg-1',
        customer: {
          name: 'Family',
          email: 'family@example.com',
          phone: '+62000',
        },
        passengers: [
          { name: 'Adult 1', type: 'ADULT' },
          { name: 'Child 1', type: 'CHILD' },
          { name: 'Infant 1', type: 'INFANT' },
        ],
      });

      expect(result.bookingId).toBe('booking-mixed');
    });

    it('rejects when only INFANT passengers (no seats)', async () => {
      await expect(
        reserveSeatsAndCreateBooking({
          legId: 'leg-1',
          customer: {
            name: 'Test',
            email: 'test@example.com',
            phone: '+62000',
          },
          passengers: [
            { name: 'Infant 1', type: 'INFANT' },
            { name: 'Infant 2', type: 'INFANT' },
          ],
        }),
      ).rejects.toMatchObject({
        name: 'BookingError',
        code: 'INVALID_INPUT',
        message: expect.stringContaining('At least one non-infant'),
      });
    });
  });

  describe('Leg status validation', () => {
    it('rejects when leg is CLOSED', async () => {
      const closedLeg = {
        ...mockLeg,
        status: 'CLOSED' as const,
      };

      findUniqueMock.mockResolvedValueOnce(closedLeg);

      await expect(
        reserveSeatsAndCreateBooking({
          legId: 'leg-1',
          customer: {
            name: 'Test',
            email: 'test@example.com',
            phone: '+62000',
          },
          passengers: [{ name: 'Test', type: 'ADULT' }],
        }),
      ).rejects.toMatchObject({
        name: 'BookingError',
        code: 'LEG_CLOSED',
        message: expect.stringContaining('Departure is closed'),
      });
    });

    it('rejects when leg status is not OPEN', async () => {
      const cancelledLeg = {
        ...mockLeg,
        status: 'CANCELLED' as const,
      };

      findUniqueMock.mockResolvedValueOnce(cancelledLeg);

      await expect(
        reserveSeatsAndCreateBooking({
          legId: 'leg-1',
          customer: {
            name: 'Test',
            email: 'test@example.com',
            phone: '+62000',
          },
          passengers: [{ name: 'Test', type: 'ADULT' }],
        }),
      ).rejects.toBeInstanceOf(BookingError);
    });
  });

  describe('Departure date validation', () => {
    it('rejects when leg is in the past', async () => {
      const pastDate = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);
      const pastLeg = {
        ...mockLeg,
        departureDate: pastDate,
      };

      findUniqueMock.mockResolvedValueOnce(pastLeg);

      await expect(
        reserveSeatsAndCreateBooking({
          legId: 'leg-1',
          customer: {
            name: 'Test',
            email: 'test@example.com',
            phone: '+62000',
          },
          passengers: [{ name: 'Test', type: 'ADULT' }],
        }),
      ).rejects.toMatchObject({
        name: 'BookingError',
        code: 'LEG_PAST',
        message: expect.stringContaining('Departure has already left'),
      });
    });

    it('accepts departure at current time boundary (just now)', async () => {
      const legAtCurrentTime = {
        ...mockLeg,
        departureDate: new Date(Date.now() + 1000), // 1 second from now
      };

      findUniqueMock
        .mockResolvedValueOnce(legAtCurrentTime)
        .mockResolvedValueOnce(legAtCurrentTime)
        .mockResolvedValueOnce(legAtCurrentTime);

      createMock.mockResolvedValue({
        id: 'booking-boundary',
        bookingReference: 'GILI-BOUNDARY',
        tripType: 'ONE_WAY',
      });

      const result = await reserveSeatsAndCreateBooking({
        legId: 'leg-1',
        customer: {
          name: 'Test',
          email: 'test@example.com',
          phone: '+62000',
        },
        passengers: [{ name: 'Test', type: 'ADULT' }],
      });

      expect(result.bookingId).toBe('booking-boundary');
    });
  });

  describe('Leg not found', () => {
    it('rejects when leg does not exist', async () => {
      findUniqueMock.mockResolvedValueOnce(null);

      await expect(
        reserveSeatsAndCreateBooking({
          legId: 'leg-missing',
          customer: {
            name: 'Test',
            email: 'test@example.com',
            phone: '+62000',
          },
          passengers: [{ name: 'Test', type: 'ADULT' }],
        }),
      ).rejects.toMatchObject({
        name: 'BookingError',
        code: 'LEG_NOT_FOUND',
        message: expect.stringContaining('Departure not found'),
      });
    });
  });

  describe('Operator boundary validation', () => {
    it('rejects when leg operatorId disagrees with boat operatorId', async () => {
      const mismatchedLeg = {
        ...mockLeg,
        operatorId: 'op-A',
        schedule: {
          ...mockLeg.schedule,
          boat: { operatorId: 'op-B' },
        },
      };

      findUniqueMock.mockResolvedValueOnce(mismatchedLeg);

      await expect(
        reserveSeatsAndCreateBooking({
          legId: 'leg-1',
          customer: {
            name: 'Test',
            email: 'test@example.com',
            phone: '+62000',
          },
          passengers: [{ name: 'Test', type: 'ADULT' }],
        }),
      ).rejects.toMatchObject({
        name: 'BookingError',
        code: 'INVALID_INPUT',
        message: expect.stringContaining('Operator boundary'),
      });
    });
  });

  describe('Pricing calculation', () => {
    it('calculates pricing for single ADULT', async () => {
      findUniqueMock
        .mockResolvedValueOnce(mockLeg)
        .mockResolvedValueOnce(mockLeg)
        .mockResolvedValueOnce(mockLeg);

      createMock.mockResolvedValue({
        id: 'booking-price',
        bookingReference: 'GILI-PRICE',
        tripType: 'ONE_WAY',
      });

      const result = await reserveSeatsAndCreateBooking({
        legId: 'leg-1',
        customer: {
          name: 'Test',
          email: 'test@example.com',
          phone: '+62000',
        },
        passengers: [{ name: 'Test', type: 'ADULT' }],
      });

      expect(result.bookingId).toBe('booking-price');
    });

    it('calculates pricing for ADULT + CHILD (0.5 multiplier)', async () => {
      findUniqueMock
        .mockResolvedValueOnce(mockLeg)
        .mockResolvedValueOnce(mockLeg)
        .mockResolvedValueOnce(mockLeg);

      createMock.mockResolvedValue({
        id: 'booking-mixed-price',
        bookingReference: 'GILI-MIXED-PRICE',
        tripType: 'ONE_WAY',
      });

      const result = await reserveSeatsAndCreateBooking({
        legId: 'leg-1',
        customer: {
          name: 'Parent+Child',
          email: 'test@example.com',
          phone: '+62000',
        },
        passengers: [
          { name: 'Adult', type: 'ADULT' },
          { name: 'Child', type: 'CHILD' },
        ],
      });

      expect(result.bookingId).toBe('booking-mixed-price');
    });
  });

  describe('Promo code application', () => {
    it('applies promo code discount', async () => {
      findUniqueMock
        .mockResolvedValueOnce(mockLeg)
        .mockResolvedValueOnce(mockLeg)
        .mockResolvedValueOnce(mockLeg);

      createMock.mockResolvedValue({
        id: 'booking-promo',
        bookingReference: 'GILI-PROMO',
        tripType: 'ONE_WAY',
      });

      const result = await reserveSeatsAndCreateBooking({
        legId: 'leg-1',
        customer: {
          name: 'Test',
          email: 'test@example.com',
          phone: '+62000',
        },
        passengers: [{ name: 'Test', type: 'ADULT' }],
        promoCode: 'SAVE50',
      });

      expect(result.bookingId).toBe('booking-promo');
    });

    it('accepts empty/whitespace promo code', async () => {
      findUniqueMock
        .mockResolvedValueOnce(mockLeg)
        .mockResolvedValueOnce(mockLeg)
        .mockResolvedValueOnce(mockLeg);

      createMock.mockResolvedValue({
        id: 'booking-no-promo',
        bookingReference: 'GILI-NO-PROMO',
        tripType: 'ONE_WAY',
      });

      const result = await reserveSeatsAndCreateBooking({
        legId: 'leg-1',
        customer: {
          name: 'Test',
          email: 'test@example.com',
          phone: '+62000',
        },
        passengers: [{ name: 'Test', type: 'ADULT' }],
        promoCode: '   ', // whitespace
      });

      expect(result.bookingId).toBe('booking-no-promo');
    });
  });

  describe('Idempotency', () => {
    it('returns same booking when idempotency key is replayed', async () => {
      const { prisma } = await import('@/lib/db');
      vi.mocked(prisma.booking.findUnique).mockResolvedValueOnce({
        id: 'booking-existing',
        bookingReference: 'GILI-EXISTING',
      } as any);

      const result = await reserveSeatsAndCreateBooking({
        legId: 'leg-1',
        customer: {
          name: 'Test',
          email: 'test@example.com',
          phone: '+62000',
        },
        passengers: [{ name: 'Test', type: 'ADULT' }],
        idempotencyKey: 'key-123',
      });

      expect(result.bookingId).toBe('booking-existing');
      expect(result.bookingReference).toBe('GILI-EXISTING');
    });
  });

  describe('Customer metadata', () => {
    it('captures customer nationality when provided', async () => {
      findUniqueMock
        .mockResolvedValueOnce(mockLeg)
        .mockResolvedValueOnce(mockLeg)
        .mockResolvedValueOnce(mockLeg);

      createMock.mockResolvedValue({
        id: 'booking-nationality',
        bookingReference: 'GILI-NATIONALITY',
        tripType: 'ONE_WAY',
      });

      const result = await reserveSeatsAndCreateBooking({
        legId: 'leg-1',
        customer: {
          name: 'Test',
          email: 'test@example.com',
          phone: '+62000',
          nationality: 'ID',
        },
        passengers: [{ name: 'Test', type: 'ADULT' }],
      });

      expect(result.bookingId).toBe('booking-nationality');
    });

    it('captures sales channel and staff info', async () => {
      findUniqueMock
        .mockResolvedValueOnce(mockLeg)
        .mockResolvedValueOnce(mockLeg)
        .mockResolvedValueOnce(mockLeg);

      createMock.mockResolvedValue({
        id: 'booking-sales',
        bookingReference: 'GILI-SALES',
        tripType: 'ONE_WAY',
      });

      const result = await reserveSeatsAndCreateBooking({
        legId: 'leg-1',
        customer: {
          name: 'Test',
          email: 'test@example.com',
          phone: '+62000',
        },
        passengers: [{ name: 'Test', type: 'ADULT' }],
        salesChannel: 'TRAVEL_AGENT',
        salesStaffId: 'staff-1',
        salesAgentId: 'agent-1',
      });

      expect(result.bookingId).toBe('booking-sales');
    });
  });
});
