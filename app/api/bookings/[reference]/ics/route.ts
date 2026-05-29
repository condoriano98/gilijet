import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";

function icsEscape(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

function toIcsUtc(d: Date): string {
  // YYYYMMDDTHHMMSSZ
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ reference: string }> },
) {
  const { reference } = await params;

  const booking = await prisma.booking.findUnique({
    where: { bookingReference: reference },
    include: {
      leg: { include: { schedule: { include: { boat: { include: { operator: true } } } } } },
    },
  });

  if (!booking || booking.status !== "CONFIRMED") {
    return new Response("Not found", { status: 404 });
  }

  const { schedule, departureDate } = booking.leg;
  const arrival = new Date(
    departureDate.getTime() + schedule.durationMinutes * 60 * 1000,
  );

  const summary = `Boat: ${schedule.originPort} → ${schedule.destinationPort}`;
  const description = [
    `Booking ${booking.bookingReference}`,
    `Operator: ${schedule.boat.operator.companyName}`,
    `Boat: ${schedule.boat.name}`,
    `Arrive at the dock at least 30 minutes early with a government ID.`,
  ].join("\n");

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Gilijet//Booking//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${booking.bookingReference}@gilijet`,
    `DTSTAMP:${toIcsUtc(new Date())}`,
    `DTSTART:${toIcsUtc(departureDate)}`,
    `DTEND:${toIcsUtc(arrival)}`,
    `SUMMARY:${icsEscape(summary)}`,
    `DESCRIPTION:${icsEscape(description)}`,
    `LOCATION:${icsEscape(schedule.originPort)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  const ics = lines.join("\r\n");

  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="gilijet-${booking.bookingReference}.ics"`,
    },
  });
}

export const dynamic = "force-dynamic";
