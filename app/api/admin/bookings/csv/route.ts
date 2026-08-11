import { NextRequest } from "next/server";
import { Prisma, BookingStatus } from "@prisma/client";
import { getAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatLocalDateTime } from "@/lib/datetime";

const STATUS_FILTERS: BookingStatus[] = [
  "PENDING_PAYMENT",
  "AWAITING_CONFIRMATION",
  "CONFIRMED",
  "CANCELLED_BY_CUSTOMER",
  "CANCELLED_BY_OPERATOR",
  "EXPIRED",
];

function csvEscape(v: string): string {
  if (v.includes(",") || v.includes('"') || v.includes("\n") || v.includes("\r")) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

export async function GET(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const q = req.nextUrl.searchParams.get("q") ?? undefined;
  const status = req.nextUrl.searchParams.get("status") ?? undefined;

  const where: Prisma.BookingWhereInput = {};
  if (status && STATUS_FILTERS.includes(status as BookingStatus)) {
    where.status = status as BookingStatus;
  }
  if (q && q.trim()) {
    const term = q.trim();
    where.OR = [
      { bookingReference: { contains: term, mode: "insensitive" } },
      { customerEmail: { contains: term, mode: "insensitive" } },
      { customerName: { contains: term, mode: "insensitive" } },
    ];
  }

  const bookings = await prisma.booking.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 5000,
    include: {
      leg: { include: { schedule: { include: { boat: true } } } },
    },
  });

  const header = [
    "Reference",
    "Status",
    "Origin",
    "Destination",
    "Boat",
    "Departure",
    "Customer",
    "Email",
    "Phone",
    "Amount",
    "Created",
  ];

  const rows = bookings.map((b) => [
    b.bookingReference,
    b.status,
    b.leg.schedule.originPort,
    b.leg.schedule.destinationPort,
    b.leg.schedule.boat.name,
    formatLocalDateTime(b.leg.departureDate),
    b.customerName,
    b.customerEmail,
    b.customerPhone,
    String(Number(b.totalAmount)),
    formatLocalDateTime(b.createdAt),
  ]);

  const csv = [header, ...rows]
    .map((row) => row.map(csvEscape).join(","))
    .join("\r\n");

  const dateStr = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="bookings-${dateStr}.csv"`,
    },
  });
}

export const dynamic = "force-dynamic";
