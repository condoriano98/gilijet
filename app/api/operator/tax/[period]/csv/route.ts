import { NextRequest } from "next/server";
import { EFakturStatus } from "@prisma/client";
import { requireOperator } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatLocalDate } from "@/lib/datetime";

function csvEscape(v: string): string {
  if (v.includes(",") || v.includes('"') || v.includes("\n") || v.includes("\r")) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ period: string }> },
) {
  const session = await requireOperator();

  const { period } = await params;
  if (!/^\d{4}-\d{2}$/.test(period)) {
    return new Response("Invalid period format. Expected YYYY-MM.", {
      status: 400,
    });
  }

  const [year, month] = period.split("-").map(Number);
  if (month < 1 || month > 12) {
    return new Response("Invalid month.", { status: 400 });
  }

  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1);

  // Same population as the Pajak page's PPN table (confirmed bookings in the
  // e-Faktur set) so the exported totals reconcile with the on-screen figures.
  const bookings = await prisma.booking.findMany({
    where: {
      operatorId: session.sub,
      status: "CONFIRMED",
      eFakturStatus: {
        in: [
          EFakturStatus.DRAFT,
          EFakturStatus.SUBMITTED,
          EFakturStatus.ACCEPTED,
        ],
      },
      createdAt: { gte: start, lt: end },
    },
    orderBy: { createdAt: "asc" },
  });

  const header = [
    "booking_ref",
    "customer_name",
    "gross_amount",
    "dpp",
    "ppn_11pct",
    "e_faktur_status",
    "e_faktur_number",
    "date",
  ];

  const rows = bookings.map((b) => {
    const gross = Number(b.totalAmount);
    return [
      b.bookingReference,
      b.customerName,
      gross.toFixed(2),
      gross.toFixed(2),
      (gross * 0.11).toFixed(2),
      b.eFakturStatus,
      b.eFakturNumber ?? "",
      formatLocalDate(b.createdAt, "yyyy-MM-dd"),
    ];
  });

  const csv = [header, ...rows]
    .map((row) => row.map(csvEscape).join(","))
    .join("\r\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="pajak-ppn-${period}.csv"`,
    },
  });
}

export const dynamic = "force-dynamic";
