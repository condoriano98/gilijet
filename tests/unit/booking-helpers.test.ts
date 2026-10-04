import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';
import type { Booking, Leg } from '@prisma/client';
import {
  getMainLeg,
  getReturnLeg,
  getAllLegsForBooking,
} from '@/lib/booking-helpers';

describe('booking-helpers', () => {
  const baseLeg: Leg = {
    id: 'leg-1',
    scheduleId: 'sched-1',
    operatorId: 'op-1',
    status: 'OPEN',
    departureDate: new Date('2026-10-15T08:00:00Z'),
    basePrice: new Prisma.Decimal('250000'),
    cancellationReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const outboundLeg: Leg = {
    ...baseLeg,
    id: 'leg-outbound-1',
  };

  const returnLeg: Leg = {
    ...baseLeg,
    id: 'leg-return-1',
    departureDate: new Date('2026-10-20T08:00:00Z'),
  };

  const baseBooking = {
    id: 'booking-1',
    bookingReference: 'GILI-ABC123',
    legId: null,
    outboundLegId: null,
    returnLegId: null,
    tripType: 'ONE_WAY',
    operatorId: 'op-1',
    customerId: null,
    customerName: 'John Doe',
    customerEmail: 'john@example.com',
    customerPhone: '+62812345678',
    customerNationality: null,
    totalAmount: new Prisma.Decimal('500000'),
    commissionAmount: new Prisma.Decimal('40000'),
    operatorAmount: new Prisma.Decimal('460000'),
    promotionId: null,
    discountAmount: new Prisma.Decimal('0'),
    status: 'PENDING_PAYMENT',
    salesChannel: 'GILIFAST',
    salesStaffId: null,
    salesAgentId: null,
    refundDeadline: new Date('2026-10-22T08:00:00Z'),
    refundPolicySnapshot: null,
    notes: null,
    idempotencyKey: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as Booking;

  describe('getMainLeg()', () => {
    it('returns leg for ONE_WAY booking type', () => {
      const booking = {
        ...baseBooking,
        tripType: 'ONE_WAY' as const,
        leg: baseLeg,
      } as Booking & { leg?: Leg | null };

      const mainLeg = getMainLeg(booking);

      expect(mainLeg).toBe(baseLeg);
      expect(mainLeg?.id).toBe('leg-1');
    });

    it('returns outboundLeg for ROUND_TRIP booking type', () => {
      const booking = {
        ...baseBooking,
        tripType: 'ROUND_TRIP' as const,
        outboundLeg,
        returnLeg,
      } as Booking & { outboundLeg?: Leg | null; returnLeg?: Leg | null };

      const mainLeg = getMainLeg(booking);

      expect(mainLeg).toBe(outboundLeg);
      expect(mainLeg?.id).toBe('leg-outbound-1');
    });

    it('returns undefined when ONE_WAY booking has no leg', () => {
      const booking = {
        ...baseBooking,
        tripType: 'ONE_WAY' as const,
        leg: null,
      } as Booking & { leg?: Leg | null };

      const mainLeg = getMainLeg(booking);

      expect(mainLeg).toBeNull();
    });

    it('returns undefined when ROUND_TRIP booking has no outboundLeg', () => {
      const booking = {
        ...baseBooking,
        tripType: 'ROUND_TRIP' as const,
        outboundLeg: null,
        returnLeg,
      } as Booking & { outboundLeg?: Leg | null; returnLeg?: Leg | null };

      const mainLeg = getMainLeg(booking);

      expect(mainLeg).toBeNull();
    });

    it('prefers outboundLeg when ROUND_TRIP even if leg is set', () => {
      const booking = {
        ...baseBooking,
        tripType: 'ROUND_TRIP' as const,
        leg: baseLeg,
        outboundLeg,
        returnLeg,
      } as Booking & { leg?: Leg | null; outboundLeg?: Leg | null; returnLeg?: Leg | null };

      const mainLeg = getMainLeg(booking);

      expect(mainLeg).toBe(outboundLeg);
      expect(mainLeg?.id).not.toBe(baseLeg.id);
    });
  });

  describe('getReturnLeg()', () => {
    it('returns null for ONE_WAY booking type', () => {
      const booking = {
        ...baseBooking,
        tripType: 'ONE_WAY' as const,
        leg: baseLeg,
      } as Booking & { leg?: Leg | null };

      const returnLegResult = getReturnLeg(booking);

      expect(returnLegResult).toBeNull();
    });

    it('returns returnLeg for ROUND_TRIP booking type', () => {
      const booking = {
        ...baseBooking,
        tripType: 'ROUND_TRIP' as const,
        outboundLeg,
        returnLeg,
      } as Booking & { outboundLeg?: Leg | null; returnLeg?: Leg | null };

      const returnLegResult = getReturnLeg(booking);

      expect(returnLegResult).toBe(returnLeg);
      expect(returnLegResult?.id).toBe('leg-return-1');
    });

    it('returns null when ROUND_TRIP booking has no returnLeg', () => {
      const booking = {
        ...baseBooking,
        tripType: 'ROUND_TRIP' as const,
        outboundLeg,
        returnLeg: null,
      } as Booking & { outboundLeg?: Leg | null; returnLeg?: Leg | null };

      const returnLegResult = getReturnLeg(booking);

      expect(returnLegResult).toBeNull();
    });

    it('ignores leg property for ROUND_TRIP', () => {
      const booking = {
        ...baseBooking,
        tripType: 'ROUND_TRIP' as const,
        leg: baseLeg,
        outboundLeg,
        returnLeg,
      } as Booking & { leg?: Leg | null; outboundLeg?: Leg | null; returnLeg?: Leg | null };

      const returnLegResult = getReturnLeg(booking);

      expect(returnLegResult).toBe(returnLeg);
      expect(returnLegResult?.id).not.toBe(baseLeg.id);
    });
  });

  describe('getAllLegsForBooking()', () => {
    it('returns array with single leg for ONE_WAY booking', () => {
      const booking = {
        ...baseBooking,
        tripType: 'ONE_WAY' as const,
        leg: baseLeg,
      } as Booking & { leg?: Leg | null };

      const legs = getAllLegsForBooking(booking);

      expect(legs).toHaveLength(1);
      expect(legs[0]).toBe(baseLeg);
      expect(legs[0].id).toBe('leg-1');
    });

    it('returns empty array when ONE_WAY booking has no leg', () => {
      const booking = {
        ...baseBooking,
        tripType: 'ONE_WAY' as const,
        leg: null,
      } as Booking & { leg?: Leg | null };

      const legs = getAllLegsForBooking(booking);

      expect(legs).toHaveLength(0);
      expect(legs).toEqual([]);
    });

    it('returns array with both legs for ROUND_TRIP booking', () => {
      const booking = {
        ...baseBooking,
        tripType: 'ROUND_TRIP' as const,
        outboundLeg,
        returnLeg,
      } as Booking & { outboundLeg?: Leg | null; returnLeg?: Leg | null };

      const legs = getAllLegsForBooking(booking);

      expect(legs).toHaveLength(2);
      expect(legs[0]).toBe(outboundLeg);
      expect(legs[1]).toBe(returnLeg);
      expect(legs[0].id).toBe('leg-outbound-1');
      expect(legs[1].id).toBe('leg-return-1');
    });

    it('filters out null legs in ROUND_TRIP', () => {
      const booking = {
        ...baseBooking,
        tripType: 'ROUND_TRIP' as const,
        outboundLeg,
        returnLeg: null,
      } as Booking & { outboundLeg?: Leg | null; returnLeg?: Leg | null };

      const legs = getAllLegsForBooking(booking);

      expect(legs).toHaveLength(1);
      expect(legs[0]).toBe(outboundLeg);
    });

    it('returns empty array when ROUND_TRIP has no legs', () => {
      const booking = {
        ...baseBooking,
        tripType: 'ROUND_TRIP' as const,
        outboundLeg: null,
        returnLeg: null,
      } as Booking & { outboundLeg?: Leg | null; returnLeg?: Leg | null };

      const legs = getAllLegsForBooking(booking);

      expect(legs).toHaveLength(0);
      expect(legs).toEqual([]);
    });

    it('ignores leg property when getting all legs for ROUND_TRIP', () => {
      const booking = {
        ...baseBooking,
        tripType: 'ROUND_TRIP' as const,
        leg: baseLeg,
        outboundLeg,
        returnLeg,
      } as Booking & { leg?: Leg | null; outboundLeg?: Leg | null; returnLeg?: Leg | null };

      const legs = getAllLegsForBooking(booking);

      expect(legs).toHaveLength(2);
      expect(legs).not.toContain(baseLeg);
      expect(legs).toContain(outboundLeg);
      expect(legs).toContain(returnLeg);
    });

    it('preserves leg order (outbound then return)', () => {
      const booking = {
        ...baseBooking,
        tripType: 'ROUND_TRIP' as const,
        outboundLeg,
        returnLeg,
      } as Booking & { outboundLeg?: Leg | null; returnLeg?: Leg | null };

      const legs = getAllLegsForBooking(booking);

      expect(legs[0].departureDate.getTime()).toBeLessThan(
        legs[1].departureDate.getTime(),
      );
    });

    it('returns typed Leg array that is not undefined', () => {
      const booking = {
        ...baseBooking,
        tripType: 'ONE_WAY' as const,
        leg: baseLeg,
      } as Booking & { leg?: Leg | null };

      const legs = getAllLegsForBooking(booking);

      expect(Array.isArray(legs)).toBe(true);
      expect(legs.every((l) => 'id' in l && 'departureDate' in l)).toBe(true);
    });
  });

  describe('Integration - combining all helpers', () => {
    it('correctly handles switching between ONE_WAY and ROUND_TRIP', () => {
      const oneWayBooking = {
        ...baseBooking,
        tripType: 'ONE_WAY' as const,
        leg: baseLeg,
      } as Booking & { leg?: Leg | null };

      const roundTripBooking = {
        ...baseBooking,
        tripType: 'ROUND_TRIP' as const,
        outboundLeg,
        returnLeg,
      } as Booking & { outboundLeg?: Leg | null; returnLeg?: Leg | null };

      // One-way helpers
      expect(getMainLeg(oneWayBooking)?.id).toBe('leg-1');
      expect(getReturnLeg(oneWayBooking)).toBeNull();
      expect(getAllLegsForBooking(oneWayBooking)).toHaveLength(1);

      // Round-trip helpers
      expect(getMainLeg(roundTripBooking)?.id).toBe('leg-outbound-1');
      expect(getReturnLeg(roundTripBooking)?.id).toBe('leg-return-1');
      expect(getAllLegsForBooking(roundTripBooking)).toHaveLength(2);
    });

    it('allows polymorphic booking handling', () => {
      const bookings: Array<Booking & { leg?: Leg | null; outboundLeg?: Leg | null; returnLeg?: Leg | null }> = [
        {
          ...baseBooking,
          tripType: 'ONE_WAY' as const,
          leg: baseLeg,
        },
        {
          ...baseBooking,
          id: 'booking-2',
          tripType: 'ROUND_TRIP' as const,
          outboundLeg,
          returnLeg,
        },
      ];

      const mainLegs = bookings.map(getMainLeg);
      const allLegsArrays = bookings.map(getAllLegsForBooking);

      expect(mainLegs[0]?.id).toBe('leg-1');
      expect(mainLegs[1]?.id).toBe('leg-outbound-1');
      expect(allLegsArrays[0]).toHaveLength(1);
      expect(allLegsArrays[1]).toHaveLength(2);
    });
  });
});
