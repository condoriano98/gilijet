import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireOperator } from '@/lib/auth';
import { buildQrPayload } from '@/lib/qr';
import { bookingsOnLegWhere, legRoleForBooking } from '@/lib/booking-helpers';
import { ticketStatusOnLeg, checkedInAtOnLeg } from '@/lib/leg-checkin';

/**
 * Returns a manifest of all ISSUED tickets for a leg.
 * Used by the mobile scanner for offline operation.
 * Secured by operator session; only returns tickets for legs on this operator's boats.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ legId: string }> },
) {
  let session;
  try {
    session = await requireOperator();
  } catch {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { legId } = await params;

  // Move tenant filter into WHERE so cross-tenant data is never loaded into memory
  const leg = await prisma.leg.findFirst({
    where: { id: legId, operatorId: session.sub },
    include: {
      schedule: { include: { boat: true } },
    },
  });

  if (!leg) {
    return NextResponse.json({ ok: false, error: 'Leg not found' }, { status: 404 });
  }

  const bookings = await prisma.booking.findMany({
    where: {
      ...bookingsOnLegWhere(legId),
      operatorId: session.sub,
      status: 'CONFIRMED',
    },
    include: {
      tickets: {
        where: { status: { in: ['ISSUED', 'CHECKED_IN'] } },
        include: { checkins: true },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  const tickets = bookings.flatMap((b) =>
    b.tickets.map((t) => ({
      ticketCode: t.ticketCode,
      qrPayload: buildQrPayload(t.ticketCode, leg.departureDate),
      passengerName: t.passengerName,
      status: ticketStatusOnLeg(t, b, legId),
      bookingReference: b.bookingReference,
      trip: legRoleForBooking(b, legId),
      checkedInAt: checkedInAtOnLeg(t, b, legId)?.toISOString() ?? null,
    })),
  );

  return NextResponse.json({
    ok: true,
    legId,
    departure: leg.departureDate.toISOString(),
    route: `${leg.schedule.originPort} → ${leg.schedule.destinationPort}`,
    boat: leg.schedule.boat.name,
    ticketCount: tickets.length,
    generatedAt: new Date().toISOString(),
    tickets,
  });
}

export const dynamic = 'force-dynamic';
