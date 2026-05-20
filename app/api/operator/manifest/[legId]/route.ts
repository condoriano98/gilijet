import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireOperator } from "@/lib/auth";
import { buildQrPayload } from "@/lib/qr";

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
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { legId } = await params;

  const leg = await prisma.leg.findUnique({
    where: { id: legId },
    include: {
      schedule: { include: { boat: true } },
      bookings: {
        where: { status: "CONFIRMED" },
        include: { tickets: { where: { status: { in: ["ISSUED", "CHECKED_IN"] } } } },
      },
    },
  });

  if (!leg) {
    return NextResponse.json({ ok: false, error: "Leg not found" }, { status: 404 });
  }

  // Ensure this leg belongs to the requesting operator
  if (leg.schedule.boat.operatorId !== session.sub) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const tickets = leg.bookings.flatMap((b) =>
    b.tickets.map((t) => ({
      ticketCode: t.ticketCode,
      qrPayload: buildQrPayload(t.ticketCode),
      passengerName: t.passengerName,
      status: t.status,
      bookingReference: b.bookingReference,
      checkedInAt: t.checkedInAt?.toISOString() ?? null,
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

export const dynamic = "force-dynamic";
