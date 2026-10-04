import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { env } from '@/lib/env';
import { sendDepartureReminder } from '@/lib/email';
import { buildQrPayload } from '@/lib/qr';
import { getMainLeg } from '@/lib/booking-helpers';

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!env.CRON_SECRET || authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const windowStart = new Date(now.getTime() + 23 * 60 * 60 * 1000);
  const windowEnd = new Date(now.getTime() + 25 * 60 * 60 * 1000);

  const allBookings = await prisma.booking.findMany({
    where: {
      status: 'CONFIRMED',
      reminderSentAt: null,
    },
    include: {
      leg: { include: { schedule: { include: { boat: true } } } },
      outboundLeg: { include: { schedule: { include: { boat: true } } } },
      returnLeg: { include: { schedule: { include: { boat: true } } } },
      tickets: { where: { status: { in: ['ISSUED', 'CHECKED_IN'] } } },
    },
    take: 100,
  });

  // Filter to bookings with departure in the 23-25 hour window
  const bookings = allBookings.filter((b) => {
    const mainLeg = getMainLeg(b);
    if (!mainLeg) return false;
    const time = mainLeg.departureDate.getTime();
    return time >= windowStart.getTime() && time <= windowEnd.getTime();
  });

  let sent = 0;
  let failed = 0;

  for (const booking of bookings) {
    try {
      const mainLeg = getMainLeg(booking)!;
      const tickets = booking.tickets.map((t) => ({
        ticketCode: t.ticketCode,
        passengerName: t.passengerName,
        qrPayload: buildQrPayload(t.ticketCode, mainLeg.departureDate),
      }));

      const result = await sendDepartureReminder({
        to: booking.customerEmail,
        customerName: booking.customerName,
        bookingReference: booking.bookingReference,
        route: {
          originPort: mainLeg.schedule.originPort,
          destinationPort: mainLeg.schedule.destinationPort,
        },
        boatName: mainLeg.schedule.boat.name,
        departureDate: mainLeg.departureDate,
        lookupUrl: `${env.APP_BASE_URL}/b/${booking.bookingReference}`,
        tickets,
      });

      // Mark reminded whether sent or console-logged (dev mode)
      if (result.delivered || result.provider === 'console') {
        await prisma.booking.update({
          where: { id: booking.id },
          data: { reminderSentAt: new Date() },
        });
        sent++;
      } else {
        failed++;
      }
    } catch (err) {
      console.error(`[send-reminders] failed for ${booking.bookingReference}:`, err);
      failed++;
    }
  }

  console.log(`[send-reminders] sent=${sent} failed=${failed} total=${bookings.length}`);
  return NextResponse.json({ ok: true, sent, failed, total: bookings.length });
}

export const dynamic = 'force-dynamic';
