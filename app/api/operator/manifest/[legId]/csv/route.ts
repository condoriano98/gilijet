import { NextRequest } from "next/server";
import { getOperatorSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

function csvEscape(v: string): string {
  if (v.includes(",") || v.includes('"') || v.includes("\n") || v.includes("\r")) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ legId: string }> },
) {
  const session = await getOperatorSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const { legId } = await params;

  // Move tenant filter into WHERE so cross-tenant data is never loaded into memory
  const leg = await prisma.leg.findFirst({
    where: { id: legId, operatorId: session.sub },
    include: {
      schedule: { include: { boat: true } },
      bookings: {
        where: { status: "CONFIRMED" },
        include: { tickets: true },
      },
    },
  });

  if (!leg) return new Response("Not found", { status: 404 });

  const header = ["Ticket Code", "Passenger Name", "ID Number", "Status", "Booking Reference"];
  const rows = leg.bookings.flatMap((b) =>
    b.tickets.map((t) => [
      t.ticketCode,
      t.passengerName,
      t.passengerIdNumber ?? "",
      t.status,
      b.bookingReference,
    ]),
  );

  const csv = [header, ...rows]
    .map((row) => row.map(csvEscape).join(","))
    .join("\r\n");

  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `manifest-${legId}-${dateStr}.csv`;

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

export const dynamic = "force-dynamic";
