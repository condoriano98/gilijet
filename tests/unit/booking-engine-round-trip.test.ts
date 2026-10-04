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
    const passengerCount = args.passengerTypes?.length || 1;
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

describe('createRoundTripBooking - Phase 3 Round-Trip', () => {
  const futureDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000); // 10 days from now
  const laterDate = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000); // 20 days from now

  const mockOutboundLeg = {
    id: 'leg-outbound-1',
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

  const mockReturnLeg = {
    id: 'leg-return-1',
    operatorId: 'op-A',
    status: 'OPEN' as const,
    departureDate: laterDate,
    basePrice: new Prisma.Decimal('250000'),
    schedule: {
      id: 'sched-2',
      originPort: 'MKS',
      destinationPort: 'BLI',
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

  describe('Valid round-trip booking', () => {
    it('creates booking with valid outbound + return legs', async () => {
      findUniqueMock
        .mockResolvedValueOnce(mockOutboundLeg) // Fetch outbound leg in createRoundTripBooking
        .mockResolvedValueOnce(mockReturnLeg)   // Fetch return leg in createRoundTripBooking
        .mockResolvedValueOnce(mockOutboundLeg) // Fetch for refund deadline in createBookingRow
        .mockResolvedValueOnce(mockOutboundLeg); // Extra fetch for snapshot

      createMock.mockResolvedValue({
        id: 'booking-1',
        bookingReference: 'GILI-ABC123',
        tripType: 'ROUND_TRIP',
      });

      const result = await reserveSeatsAndCreateBooking({
        outboundLegId: 'leg-outbound-1',
        returnLegId: 'leg-return-1',
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

    it('accepts multiple passenger types (ADULT, CHILD, INFANT)', async () => {
      findUniqueMock
        .mockResolvedValueOnce(mockOutboundLeg)
        .mockResolvedValueOnce(mockReturnLeg)
        .mockResolvedValueOnce(mockOutboundLeg)
        .mockResolvedValueOnce(mockOutboundLeg);

      createMock.mockResolvedValue({
        id: 'booking-2',
        bookingReference: 'GILI-XYZ789',
        tripType: 'ROUND_TRIP',
      });

      const result = await reserveSeatsAndCreateBooking({
        outboundLegId: 'leg-outbound-1',
        returnLegId: 'leg-return-1',
        customer: {
          name: 'Family Group',
          email: 'family@example.com',
          phone: '+62812345678',
        },
        passengers: [
          { name: 'Adult 1', type: 'ADULT' },
          { name: 'Child 1', type: 'CHILD' },
          { name: 'Infant 1', type: 'INFANT' },
        ],
      });

      expect(result.bookingId).toBe('booking-2');
    });
  });

  describe('Same operator validation', () => {
    it('rejects when outbound and return legs have different operators', async () => {
      const differentOperatorReturnLeg = {
        ...mockReturnLeg,
        operatorId: 'op-B',
        schedule: { ...mockReturnLeg.schedule, boat: { operatorId: 'op-B' } },
      };

      findUniqueMock
        .mockResolvedValueOnce(mockOutboundLeg)
        .mockResolvedValueOnce(differentOperatorReturnLeg);

      await expect(
        reserveSeatsAndCreateBooking({
          outboundLegId: 'leg-outbound-1',
          returnLegId: 'leg-return-1',
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
        message: expect.stringContaining('same operator'),
      });
    });

    it('rejects when outbound leg operator boundary mismatch', async () => {
      const mismatchedOutboundLeg = {
        ...mockOutboundLeg,
        operatorId: 'op-A',
        schedule: { ...mockOutboundLeg.schedule, boat: { operatorId: 'op-B' } },
      };

      findUniqueMock
        .mockResolvedValueOnce(mismatchedOutboundLeg)
        .mockResolvedValueOnce(mockReturnLeg);

      await expect(
        reserveSeatsAndCreateBooking({
          outboundLegId: 'leg-outbound-1',
          returnLegId: 'leg-return-1',
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
      });
    });
  });

  describe('Leg status validation', () => {
    it('rejects when outbound leg is CLOSED', async () => {
      const closedOutboundLeg = {
        ...mockOutboundLeg,
        status: 'CLOSED' as const,
      };

      findUniqueMock.mockResolvedValueOnce(closedOutboundLeg);
      findUniqueMock.mockResolvedValueOnce(mockReturnLeg);

      await expect(
        reserveSeatsAndCreateBooking({
          outboundLegId: 'leg-outbound-1',
          returnLegId: 'leg-return-1',
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
        message: expect.stringContaining('Outbound'),
      });
    });

    it('rejects when return leg is CLOSED', async () => {
      const closedReturnLeg = {
        ...mockReturnLeg,
        status: 'CLOSED' as const,
      };

      findUniqueMock.mockResolvedValueOnce(mockOutboundLeg);
      findUniqueMock.mockResolvedValueOnce(closedReturnLeg);

      await expect(
        reserveSeatsAndCreateBooking({
          outboundLegId: 'leg-outbound-1',
          returnLegId: 'leg-return-1',
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
        message: expect.stringContaining('Return'),
      });
    });
  });

  describe('Departure date validation', () => {
    it('rejects when outbound leg is in the past', async () => {
      const pastDate = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000); // 1 day ago
      const pastOutboundLeg = {
        ...mockOutboundLeg,
        departureDate: pastDate,
      };

      findUniqueMock.mockResolvedValueOnce(pastOutboundLeg);
      findUniqueMock.mockResolvedValueOnce(mockReturnLeg);

      await expect(
        reserveSeatsAndCreateBooking({
          outboundLegId: 'leg-outbound-1',
          returnLegId: 'leg-return-1',
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
        message: expect.stringContaining('Outbound'),
      });
    });

    it('rejects when return leg is in the past', async () => {
      const pastDate = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);
      const pastReturnLeg = {
        ...mockReturnLeg,
        departureDate: pastDate,
      };

      findUniqueMock.mockResolvedValueOnce(mockOutboundLeg);
      findUniqueMock.mockResolvedValueOnce(pastReturnLeg);

      await expect(
        reserveSeatsAndCreateBooking({
          outboundLegId: 'leg-outbound-1',
          returnLegId: 'leg-return-1',
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
        message: expect.stringContaining('Return'),
      });
    });

    it('rejects when return date is before or equal to outbound date', async () => {
      const sameDate = futureDate;
      const sameOrEarlierReturnLeg = {
        ...mockReturnLeg,
        departureDate: sameDate,
      };

      findUniqueMock.mockResolvedValueOnce(mockOutboundLeg);
      findUniqueMock.mockResolvedValueOnce(sameOrEarlierReturnLeg);

      await expect(
        reserveSeatsAndCreateBooking({
          outboundLegId: 'leg-outbound-1',
          returnLegId: 'leg-return-1',
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
        message: expect.stringContaining('Return departure must be after'),
      });
    });
  });

  describe('Leg not found', () => {
    it('rejects when outbound leg does not exist', async () => {
      findUniqueMock.mockResolvedValueOnce(null);

      await expect(
        reserveSeatsAndCreateBooking({
          outboundLegId: 'leg-missing',
          returnLegId: 'leg-return-1',
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
        message: expect.stringContaining('Outbound'),
      });
    });

    it('rejects when return leg does not exist', async () => {
      findUniqueMock.mockResolvedValueOnce(mockOutboundLeg);
      findUniqueMock.mockResolvedValueOnce(null);

      await expect(
        reserveSeatsAndCreateBooking({
          outboundLegId: 'leg-outbound-1',
          returnLegId: 'leg-missing',
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
        message: expect.stringContaining('Return'),
      });
    });
  });

  describe('Passenger validation', () => {
    it('rejects when no passengers provided', async () => {
      await expect(
        reserveSeatsAndCreateBooking({
          outboundLegId: 'leg-outbound-1',
          returnLegId: 'leg-return-1',
          customer: {
            name: 'Test',
            email: 'test@example.com',
            phone: '+62000',
          },
          passengers: [],
        }),
      ).rejects.toMatchObject({
        name: 'BookingError',
        code: 'INVALID_INPUT',
        message: expect.stringContaining('1-10 passengers'),
      });
    });

    it('rejects when only infants provided (no seat-consuming passengers)', async () => {
      await expect(
        reserveSeatsAndCreateBooking({
          outboundLegId: 'leg-outbound-1',
          returnLegId: 'leg-return-1',
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

    it('accepts max 10 passengers', async () => {
      findUniqueMock
        .mockResolvedValueOnce(mockOutboundLeg)
        .mockResolvedValueOnce(mockReturnLeg)
        .mockResolvedValueOnce(mockOutboundLeg)
        .mockResolvedValueOnce(mockOutboundLeg);

      createMock.mockResolvedValue({
        id: 'booking-3',
        bookingReference: 'GILI-MAX10',
        tripType: 'ROUND_TRIP',
      });

      const passengers = Array.from({ length: 10 }, (_, i) => ({
        name: `Passenger ${i + 1}`,
        type: 'ADULT' as const,
      }));

      const result = await reserveSeatsAndCreateBooking({
        outboundLegId: 'leg-outbound-1',
        returnLegId: 'leg-return-1',
        customer: {
          name: 'Group',
          email: 'group@example.com',
          phone: '+62000',
        },
        passengers,
      });

      expect(result.bookingId).toBe('booking-3');
    });

    it('rejects more than 10 passengers', async () => {
      const passengers = Array.from({ length: 11 }, (_, i) => ({
        name: `Passenger ${i + 1}`,
        type: 'ADULT' as const,
      }));

      await expect(
        reserveSeatsAndCreateBooking({
          outboundLegId: 'leg-outbound-1',
          returnLegId: 'leg-return-1',
          customer: {
            name: 'Group',
            email: 'group@example.com',
            phone: '+62000',
          },
          passengers,
        }),
      ).rejects.toMatchObject({
        name: 'BookingError',
        code: 'INVALID_INPUT',
        message: expect.stringContaining('1-10 passengers'),
      });
    });
  });

  describe('Input validation', () => {
    it('rejects when neither one-way nor round-trip legs provided', async () => {
      await expect(
        reserveSeatsAndCreateBooking({
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
        message: expect.stringContaining('legId'),
      });
    });

    it('prefers round-trip when both one-way and round-trip legs are provided', async () => {
      findUniqueMock
        .mockResolvedValueOnce(mockOutboundLeg)
        .mockResolvedValueOnce(mockReturnLeg)
        .mockResolvedValueOnce(mockOutboundLeg)
        .mockResolvedValueOnce(mockOutboundLeg);

      createMock.mockResolvedValue({
        id: 'booking-roundtrip',
        bookingReference: 'GILI-ROUNDTRIP',
        tripType: 'ROUND_TRIP',
      });

      const result = await reserveSeatsAndCreateBooking({
        legId: 'leg-1',
        outboundLegId: 'leg-outbound-1',
        returnLegId: 'leg-return-1',
        customer: {
          name: 'Test',
          email: 'test@example.com',
          phone: '+62000',
        },
        passengers: [{ name: 'Test', type: 'ADULT' }],
      });

      expect(result.bookingId).toBe('booking-roundtrip');
    });
  });

  describe('Promo code handling for round-trip', () => {
    it('applies promo code and splits discount equally between legs', async () => {
      findUniqueMock
        .mockResolvedValueOnce(mockOutboundLeg)
        .mockResolvedValueOnce(mockReturnLeg)
        .mockResolvedValueOnce(mockOutboundLeg)
        .mockResolvedValueOnce(mockOutboundLeg);

      createMock.mockResolvedValue({
        id: 'booking-promo',
        bookingReference: 'GILI-PROMO',
        tripType: 'ROUND_TRIP',
      });

      const result = await reserveSeatsAndCreateBooking({
        outboundLegId: 'leg-outbound-1',
        returnLegId: 'leg-return-1',
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
  });

  describe('Backward compatibility - ONE_WAY still works', () => {
    it('still creates one-way booking with legId', async () => {
      findUniqueMock
        .mockResolvedValueOnce(mockOutboundLeg) // Fetch leg
        .mockResolvedValueOnce(mockOutboundLeg) // For refund deadline
        .mockResolvedValueOnce(mockOutboundLeg); // Extra fetch for snapshot

      createMock.mockResolvedValue({
        id: 'booking-oneway',
        bookingReference: 'GILI-ONEWAY',
        tripType: 'ONE_WAY',
      });

      const result = await reserveSeatsAndCreateBooking({
        legId: 'leg-outbound-1',
        customer: {
          name: 'Test',
          email: 'test@example.com',
          phone: '+62000',
        },
        passengers: [{ name: 'Test', type: 'ADULT' }],
      });

      expect(result.bookingId).toBe('booking-oneway');
    });
  });
});
