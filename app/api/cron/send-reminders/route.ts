import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { sendDepartureReminder } from "@/lib/email";
import { sendDepartureReminderWhatsapp } from "@/lib/whatsapp";
import { buildQrPayload } from "@/lib/qr";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!env.CRON_SECRET || authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const windowStart = new Date(now.getTime() + 23 * 60 * 60 * 1000);
  const windowEnd = new Date(now.getTime() + 25 * 60 * 60 * 1000);

  const bookings = await prisma.booking.findMany({
    where: {
      status: "CONFIRMED",
      reminderSentAt: null,
      leg: {
        departureDate: { gte: windowStart, lte: windowEnd },
      },
    },
    include: {
      leg: { include: { schedule: { include: { boat: true } } } },
      tickets: { where: { status: { in: ["ISSUED", "CHECKED_IN"] } } },
    },
    take: 50,
  });

  let sent = 0;
  let failed = 0;

  for (const booking of bookings) {
    try {
      const tickets = booking.tickets.map((t) => ({
        ticketCode: t.ticketCode,
        passengerName: t.passengerName,
        qrPayload: buildQrPayload(t.ticketCode, booking.leg.departureDate),
      }));

      const lookupUrl = `${env.APP_BASE_URL}/b/${booking.bookingReference}`;
      const route = {
        originPort: booking.leg.schedule.originPort,
        destinationPort: booking.leg.schedule.destinationPort,
      };

      const [emailResult, waResult] = await Promise.allSettled([
        sendDepartureReminder({
          to: booking.customerEmail,
          customerName: booking.customerName,
          bookingReference: booking.bookingReference,
          route,
          boatName: booking.leg.schedule.boat.name,
          departureDate: booking.leg.departureDate,
          lookupUrl,
          tickets,
        }),
        sendDepartureReminderWhatsapp({
          to: booking.customerPhone,
          customerName: booking.customerName,
          bookingReference: booking.bookingReference,
          route,
          boatName: booking.leg.schedule.boat.name,
          departureDate: booking.leg.departureDate,
          lookupUrl,
        }),
      ]);

      if (emailResult.status === "rejected") {
        console.error(
          `[send-reminders] email failed for ${booking.bookingReference}:`,
          emailResult.reason,
        );
      }
      if (waResult.status === "rejected") {
        console.error(
          `[send-reminders] whatsapp failed for ${booking.bookingReference}:`,
          waResult.reason,
        );
      }

      const emailDelivered =
        emailResult.status === "fulfilled" && emailResult.value.delivered;
      const waDelivered =
        waResult.status === "fulfilled" && waResult.value.delivered;

      // Mark reminded whether sent or locally captured (dev sandbox)
      if (emailDelivered || waDelivered) {
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

export const dynamic = "force-dynamic";
