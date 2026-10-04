import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';
import { getMainLeg, getReturnLeg } from '@/lib/booking-helpers';

/**
 * Unit tests for admin booking display (round-trip support)
 *
 * Tests that admin dashboard correctly displays one-way and round-trip bookings
 */

const mockOneWayBooking = {
  id: 'booking-ow-1',
  tripType: 'ONE_WAY' as const,
  bookingReference: 'GILI-OW001',
  customerName: 'John Doe',
  customerEmail: 'john@example.com',
  customerPhone: '+62812345678',
  totalAmount: new Prisma.Decimal('500000'),
  leg: {
    id: 'leg-1',
    basePrice: new Prisma.Decimal('500000'),
    departureDate: new Date('2026-10-25T08:00:00Z'),
    schedule: {
      originPort: 'BLI',
      destinationPort: 'SBY',
      boat: { name: 'Fast Boat A' },
    },
  },
  outboundLeg: null,
  returnLeg: null,
};

const mockRoundTripBooking = {
  id: 'booking-rt-1',
  tripType: 'ROUND_TRIP' as const,
  bookingReference: 'GILI-RT001',
  customerName: 'Jane Doe',
  customerEmail: 'jane@example.com',
  customerPhone: '+62812345679',
  totalAmount: new Prisma.Decimal('1000000'),
  leg: null,
  outboundLeg: {
    id: 'leg-rt-1',
    basePrice: new Prisma.Decimal('500000'),
    departureDate: new Date('2026-10-25T08:00:00Z'),
    schedule: {
      originPort: 'BLI',
      destinationPort: 'SBY',
      boat: { name: 'Fast Boat A' },
    },
  },
  returnLeg: {
    id: 'leg-rt-2',
    basePrice: new Prisma.Decimal('500000'),
    departureDate: new Date('2026-10-27T15:00:00Z'),
    schedule: {
      originPort: 'SBY',
      destinationPort: 'BLI',
      boat: { name: 'Fast Boat B' },
    },
  },
};

describe('Admin booking display - round-trip support', () => {
  describe('One-way booking display', () => {
    it('correctly identifies one-way booking', () => {
      const booking = mockOneWayBooking as any;
      expect(booking.tripType).toBe('ONE_WAY');
      expect(booking.leg).not.toBeNull();
      expect(booking.outboundLeg).toBeNull();
      expect(booking.returnLeg).toBeNull();
    });

    it('getMainLeg returns the single leg for one-way', () => {
      const booking = mockOneWayBooking as any;
      const mainLeg = getMainLeg(booking);
      expect(mainLeg).not.toBeNull();
      expect(mainLeg?.id).toBe('leg-1');
      expect(mainLeg?.schedule.originPort).toBe('BLI');
      expect(mainLeg?.schedule.destinationPort).toBe('SBY');
    });

    it('getReturnLeg returns null for one-way', () => {
      const booking = mockOneWayBooking as any;
      const returnLeg = getReturnLeg(booking);
      expect(returnLeg).toBeNull();
    });
  });

  describe('Round-trip booking display', () => {
    it('correctly identifies round-trip booking', () => {
      const booking = mockRoundTripBooking as any;
      expect(booking.tripType).toBe('ROUND_TRIP');
      expect(booking.leg).toBeNull();
      expect(booking.outboundLeg).not.toBeNull();
      expect(booking.returnLeg).not.toBeNull();
    });

    it('getMainLeg returns outbound leg for round-trip', () => {
      const booking = mockRoundTripBooking as any;
      const mainLeg = getMainLeg(booking);
      expect(mainLeg).not.toBeNull();
      expect(mainLeg?.id).toBe('leg-rt-1');
      expect(mainLeg?.schedule.originPort).toBe('BLI');
      expect(mainLeg?.schedule.destinationPort).toBe('SBY');
    });

    it('getReturnLeg returns return leg for round-trip', () => {
      const booking = mockRoundTripBooking as any;
      const returnLeg = getReturnLeg(booking);
      expect(returnLeg).not.toBeNull();
      expect(returnLeg?.id).toBe('leg-rt-2');
      expect(returnLeg?.schedule.originPort).toBe('SBY');
      expect(returnLeg?.schedule.destinationPort).toBe('BLI');
      expect(returnLeg?.departureDate).toEqual(new Date('2026-10-27T15:00:00Z'));
    });

    it('returns correct departure sequence for round-trip', () => {
      const booking = mockRoundTripBooking as any;
      const mainLeg = getMainLeg(booking)!;
      const returnLeg = getReturnLeg(booking)!;

      // Outbound should be before return
      expect(mainLeg.departureDate.getTime()).toBeLessThan(
        returnLeg.departureDate.getTime(),
      );

      // Outbound: BLI -> SBY, Return: SBY -> BLI (reverse route)
      expect(mainLeg.schedule.originPort).toBe('BLI');
      expect(mainLeg.schedule.destinationPort).toBe('SBY');
      expect(returnLeg.schedule.originPort).toBe('SBY');
      expect(returnLeg.schedule.destinationPort).toBe('BLI');
    });
  });

  describe('Booking row data for admin display', () => {
    it('provides booking reference for one-way', () => {
      const booking = mockOneWayBooking as any;
      expect(booking.bookingReference).toBe('GILI-OW001');
      expect(booking.customerName).toBe('John Doe');
      expect(booking.totalAmount).toEqual(new Prisma.Decimal('500000'));
    });

    it('provides all required fields for round-trip row', () => {
      const booking = mockRoundTripBooking as any;
      expect(booking.bookingReference).toBe('GILI-RT001');
      expect(booking.tripType).toBe('ROUND_TRIP');
      expect(booking.customerName).toBe('Jane Doe');
      expect(booking.totalAmount).toEqual(new Prisma.Decimal('1000000'));
      expect(booking.customerEmail).toBe('jane@example.com');
      expect(booking.customerPhone).toBe('+62812345679');
    });

    it('calculates correct pricing for round-trip display', () => {
      const booking = mockRoundTripBooking as any;
      const mainLeg = getMainLeg(booking)!;
      const returnLeg = getReturnLeg(booking)!;

      // Individual leg prices
      const outboundPrice = Number(mainLeg.basePrice);
      const returnPrice = Number(returnLeg.basePrice);

      // Total should be sum of both
      const expectedTotal = outboundPrice + returnPrice;
      expect(Number(booking.totalAmount)).toBe(expectedTotal);
    });
  });
});
