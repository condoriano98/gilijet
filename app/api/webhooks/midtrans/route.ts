import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { verifyMidtransSignature } from "@/lib/midtrans";
import { confirmPaymentAndIssueTickets } from "@/lib/ticket-issuer";
import { releaseBookingSeats } from "@/lib/booking-engine";
import { sendBookingConfirmation } from "@/lib/email";
import { env } from "@/lib/env";

const notificationSchema = z.object({
  order_id: z.string().min(1),
  transaction_status: z.string(),
  status_code: z.string(),
  gross_amount: z.string(),
  payment_type: z.string().optional(),
  transaction_time: z.string().optional(),
  signature_key: z.string(),
  fraud_status: z.string().optional(),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = notificationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });
  }
  const data = parsed.data;

  // Verify signature
  if (
    !verifyMidtransSignature(
      data.order_id,
      data.status_code,
      data.gross_amount,
      data.signature_key,
    )
  ) {
    return NextResponse.json({ ok: false, error: "Invalid signature" }, { status: 401 });
  }

  const booking = await prisma.booking.findUnique({
    where: { bookingReference: data.order_id },
    include: {
      leg: { include: { schedule: { include: { boat: true } } } },
      tickets: true,
      payment: true,
    },
  });
  if (!booking) {
    return NextResponse.json({ ok: false, error: "Booking not found" }, { status: 404 });
  }

  const status = data.transaction_status;

  if (
    (status === "settlement" || status === "capture") &&
    data.fraud_status !== "deny"
  ) {
    const result = await confirmPaymentAndIssueTickets({
      bookingId: booking.id,
      paidAt: data.transaction_time ? new Date(data.transaction_time) : new Date(),
      method: data.payment_type ?? "midtrans",
      gatewayReference: data.order_id,
    });

    if (!result.alreadyIssued) {
      sendBookingConfirmation({
        to: booking.customerEmail,
        customerName: booking.customerName,
        bookingReference: result.bookingReference,
        route: {
          originPort: booking.leg.schedule.originPort,
          destinationPort: booking.leg.schedule.destinationPort,
        },
        boatName: booking.leg.schedule.boat.name,
        departureDate: booking.leg.departureDate,
        totalAmount: Number(booking.totalAmount),
        lookupUrl: `${env.APP_BASE_URL}/b/${result.bookingReference}`,
        tickets: result.tickets,
      }).catch((err) => console.error("[midtrans-webhook] email failed:", err));
    }
    return NextResponse.json({ ok: true, status: "confirmed" });
  }

  if (status === "expire" || status === "cancel" || status === "deny") {
    if (booking.status === "PENDING_PAYMENT") {
      await prisma.booking.update({
        where: { id: booking.id },
        data: { status: "EXPIRED" },
      });
      await prisma.payment.updateMany({
        where: { bookingId: booking.id, status: "PENDING" },
        data: { status: "EXPIRED" },
      });
      await releaseBookingSeats(booking.id, "expired");
    }
    return NextResponse.json({ ok: true, status: "expired" });
  }

  return NextResponse.json({ ok: true, status: "ignored" });
}
