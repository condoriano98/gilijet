import type { Leg, Booking } from '@prisma/client';

type BookingWithLegs<T> = Pick<Booking, 'tripType'> & {
  leg?: T | null;
  outboundLeg?: T | null;
  returnLeg?: T | null;
};

// For use with queries that include the leg relations. Generic over `T` so
// that callers who `include`/`select` extra leg relations (e.g. `schedule`)
// keep that shape on the way out instead of being widened to the bare `Leg`.
export function getMainLeg<T = Leg>(booking: BookingWithLegs<T>) {
  if (booking.tripType === 'ROUND_TRIP') {
    return booking.outboundLeg;
  }
  return booking.leg;
}

export function getReturnLeg<T = Leg>(booking: BookingWithLegs<T>) {
  if (booking.tripType === 'ROUND_TRIP') {
    return booking.returnLeg;
  }
  return null;
}

export function getAllLegsForBooking<T = Leg>(booking: BookingWithLegs<T>) {
  if (booking.tripType === 'ROUND_TRIP') {
    return [booking.outboundLeg, booking.returnLeg].filter(Boolean) as T[];
  }
  return booking.leg ? [booking.leg] : [];
}
