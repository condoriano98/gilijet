import type { Leg, Booking } from '@prisma/client';

// For use with queries that include the leg relations
export function getMainLeg(booking: Booking & { leg?: Leg | null; outboundLeg?: Leg | null; returnLeg?: Leg | null }) {
  if (booking.tripType === 'ROUND_TRIP') {
    return booking.outboundLeg;
  }
  return booking.leg;
}

export function getReturnLeg(booking: Booking & { leg?: Leg | null; outboundLeg?: Leg | null; returnLeg?: Leg | null }) {
  if (booking.tripType === 'ROUND_TRIP') {
    return booking.returnLeg;
  }
  return null;
}

export function getAllLegsForBooking(booking: Booking & { leg?: Leg | null; outboundLeg?: Leg | null; returnLeg?: Leg | null }) {
  if (booking.tripType === 'ROUND_TRIP') {
    return [booking.outboundLeg, booking.returnLeg].filter(Boolean) as Leg[];
  }
  return booking.leg ? [booking.leg] : [];
}
