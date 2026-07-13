import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/** Lightweight status poll for the pay page (VA/QRIS wait for the webhook). */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ reference: string }> },
) {
  const { reference } = await params;
  const booking = await prisma.booking.findUnique({
    where: { bookingReference: reference },
    select: { status: true, payment: { select: { status: true } } },
  });
  if (!booking) {
    return NextResponse.json({ ok: false }, { status: 404 });
  }
  return NextResponse.json({
    ok: true,
    bookingStatus: booking.status,
    paymentStatus: booking.payment?.status ?? null,
  });
}

export const dynamic = "force-dynamic";
