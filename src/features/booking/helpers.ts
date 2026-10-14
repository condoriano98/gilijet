import type { Leg, Booking, Prisma } from '@prisma/client';
import type { PassengerType } from '@/features/pricing/pricing';

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

// Every booking that sails on `legId`: one-way (legId) plus round-trip as
// outbound or return. Round-trip rows keep legId NULL, so a bare
// `where: { legId }` silently drops them.
export function bookingsOnLegWhere(legId: string): Prisma.BookingWhereInput {
  return { OR: [{ legId }, { outboundLegId: legId }, { returnLegId: legId }] };
}

export type LegRole = 'ONE_WAY' | 'OUTBOUND' | 'RETURN';

export const LEG_ROLE_LABEL: Record<LegRole, string> = {
  ONE_WAY: 'One-way',
  OUTBOUND: 'Round trip · outbound',
  RETURN: 'Round trip · return',
};

export function legRoleForBooking(
  booking: Pick<Booking, 'tripType' | 'returnLegId'>,
  legId: string,
): LegRole {
  if (booking.tripType !== 'ROUND_TRIP') return 'ONE_WAY';
  return booking.returnLegId === legId ? 'RETURN' : 'OUTBOUND';
}

/** Per-seat fare of one leg for each passenger type. */
export type PassengerFares = { adult: number; child: number; infant: number };

/**
 * What each leg of a round trip costs for this passenger mix. The two sum to the
 * combined price the booking form charges, so the Outbound / Return lines can
 * sit above the Total without ever disagreeing with it.
 */
export function roundTripBreakdown(
  types: PassengerType[],
  outbound: PassengerFares,
  returnLeg: PassengerFares,
): { outbound: number; return: number } {
  const sum = (fares: PassengerFares) =>
    types.reduce((acc, t) => acc + (t === 'ADULT' ? fares.adult : t === 'CHILD' ? fares.child : fares.infant), 0);
  return { outbound: sum(outbound), return: sum(returnLeg) };
}
