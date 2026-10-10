import type { Booking, Prisma, TicketStatus } from '@prisma/client';

type BookingLegs = Pick<Booking, 'tripType' | 'legId' | 'outboundLegId'>;

type TicketBoarding = {
  status: TicketStatus;
  checkedInAt: Date | null;
  checkins: { legId: string; checkedInAt: Date }[];
};

// A ticket flagged CHECKED_IN before TicketCheckin existed meant "boarded the
// first leg", so that leg counts as boarded even without a row.
function firstLegId(booking: BookingLegs): string | null {
  return booking.tripType === 'ROUND_TRIP' ? booking.outboundLegId : booking.legId;
}

export function boardedLegIds(ticket: TicketBoarding, booking: BookingLegs): Set<string> {
  const ids = new Set(ticket.checkins.map((c) => c.legId));
  const first = firstLegId(booking);
  if (ticket.status === 'CHECKED_IN' && first) ids.add(first);
  return ids;
}

export function checkedInAtOnLeg(
  ticket: TicketBoarding,
  booking: BookingLegs,
  legId: string,
): Date | null {
  const row = ticket.checkins.find((c) => c.legId === legId);
  if (row) return row.checkedInAt;
  if (ticket.status === 'CHECKED_IN' && firstLegId(booking) === legId) return ticket.checkedInAt;
  return null;
}

// Ticket status as seen from one leg's manifest: a round-trip passenger who
// boarded outbound is still ISSUED on the return leg.
export function ticketStatusOnLeg(
  ticket: TicketBoarding,
  booking: BookingLegs,
  legId: string,
): TicketStatus {
  if (ticket.status === 'REFUNDED' || ticket.status === 'NO_SHOW') return ticket.status;
  return boardedLegIds(ticket, booking).has(legId) ? 'CHECKED_IN' : 'ISSUED';
}

// The unique (ticketId, legId) row is the gate, so two scanners racing on the
// same leg see exactly one success. createMany+skipDuplicates (not create+catch)
// because a unique violation would abort the surrounding Postgres transaction.
export async function recordLegCheckin(
  tx: Prisma.TransactionClient,
  args: {
    ticket: TicketBoarding & { id: string };
    booking: BookingLegs;
    legId: string;
    by: string;
  },
): Promise<{ ok: boolean }> {
  const { ticket, booking, legId, by } = args;

  const created = await tx.ticketCheckin.createMany({
    data: [{ ticketId: ticket.id, legId, checkedInBy: by }],
    skipDuplicates: true,
  });
  if (created.count === 0) return { ok: false };

  const boarded = boardedLegIds(ticket, booking);
  boarded.add(legId);
  const legCount = booking.tripType === 'ROUND_TRIP' ? 2 : 1;
  if (boarded.size >= legCount) {
    await tx.ticket.updateMany({
      where: { id: ticket.id, status: 'ISSUED' },
      data: { status: 'CHECKED_IN', checkedInAt: new Date(), checkedInBy: by },
    });
  }
  return { ok: true };
}
