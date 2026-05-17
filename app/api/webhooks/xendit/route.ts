import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { verifyWebhookToken } from "@/lib/xendit";
import { confirmPaymentAndIssueTickets } from "@/lib/ticket-issuer";
import { releaseBookingSeats } from "@/lib/booking-engine";
import { sendBookingConfirmation } from "@/lib/email";

/**
 * Xendit posts invoice + refund events here. Validates the x-callback-token
 * header against XENDIT_WEBHOOK_VERIFICATION_TOKEN; everything else (DB
 * mutations, email) is idempotent so re-delivery is safe.
 *
 * Events handled:
 *  - invoice.paid    → confirm booking, issue tickets, send email
 *  - invoice.expired → release seats, mark EXPIRED
 *  - refund.succeeded → mark Refund COMPLETED
 *  - refund.failed   → mark Refund FAILED (admin will manual-handle)
 */
export async function POST(req: NextRequest) {
  const token = req.headers.get("x-callback-token");
  if (!verifyWebhookToken(token)) {
    return NextResponse.json(
      { ok: false, error: "Invalid callback token" },
      { status: 401 },
    );
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON" },
      { status: 400 },
    );
  }
  if (!payload || typeof payload !== "object") {
    return NextResponse.json(
      { ok: false, error: "Empty payload" },
      { status: 400 },
    );
  }

  const body = payload as Record<string, unknown>;

  // Xendit sends a top-level `status` for invoices ("PAID"/"EXPIRED"). For
  // refund webhooks the event-style key is `event` ("refund.succeeded").
  const status = String(body.status ?? "").toUpperCase();
  const event = String(body.event ?? "").toLowerCase();

  try {
    if (status === "PAID") {
      return await handleInvoicePaid(body);
    }
    if (status === "EXPIRED" || event === "invoice.expired") {
      return await handleInvoiceExpired(body);
    }
    if (event === "refund.succeeded") {
      return await handleRefundSucceeded(body);
    }
    if (event === "refund.failed") {
      return await handleRefundFailed(body);
    }

    // Unknown event — ack so Xendit doesn't keep retrying.
    return NextResponse.json({ ok: true, ignored: true });
  } catch (err) {
    console.error("[xendit-webhook] handler error:", err);
    return NextResponse.json(
      { ok: false, error: "Handler error" },
      { status: 500 },
    );
  }
}

async function handleInvoicePaid(body: Record<string, unknown>) {
  const externalId = String(body.external_id ?? "");
  const invoiceId = String(body.id ?? body.invoice_id ?? "");
  if (!externalId) {
    return NextResponse.json(
      { ok: false, error: "Missing external_id" },
      { status: 400 },
    );
  }

  const booking = await prisma.booking.findUnique({
    where: { bookingReference: externalId },
    include: {
      leg: { include: { schedule: { include: { boat: true } } } },
      tickets: true,
      payment: true,
    },
  });
  if (!booking) {
    return NextResponse.json(
      { ok: false, error: "Booking not found" },
      { status: 404 },
    );
  }

  // Idempotent: confirmPaymentAndIssueTickets short-circuits if already done.
  const result = await confirmPaymentAndIssueTickets({
    bookingId: booking.id,
    paidAt:
      typeof body.paid_at === "string" ? new Date(body.paid_at) : new Date(),
    method: typeof body.payment_method === "string" ? body.payment_method : "xendit",
    gatewayReference: invoiceId || null,
    gatewayFee:
      typeof body.fees_paid_amount === "number"
        ? body.fees_paid_amount
        : null,
  });

  // Persist the raw webhook for debugging — small JSON, useful in disputes.
  if (booking.payment) {
    await prisma.payment.update({
      where: { bookingId: booking.id },
      data: { rawWebhookData: body as never },
    });
  }

  if (!result.alreadyIssued) {
    await sendBookingConfirmation({
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
    }).catch((err) =>
      console.error("[xendit-webhook] email send failed:", err),
    );
  }

  return NextResponse.json({ ok: true, status: "confirmed" });
}

async function handleInvoiceExpired(body: Record<string, unknown>) {
  const externalId = String(body.external_id ?? "");
  if (!externalId)
    return NextResponse.json({ ok: false }, { status: 400 });

  const booking = await prisma.booking.findUnique({
    where: { bookingReference: externalId },
  });
  if (!booking)
    return NextResponse.json({ ok: false }, { status: 404 });
  if (booking.status !== "PENDING_PAYMENT") {
    return NextResponse.json({ ok: true, noop: true });
  }

  await prisma.booking.update({
    where: { id: booking.id },
    data: { status: "EXPIRED" },
  });
  await prisma.payment.updateMany({
    where: { bookingId: booking.id, status: "PENDING" },
    data: { status: "EXPIRED" },
  });
  await releaseBookingSeats(booking.id, "expired");
  return NextResponse.json({ ok: true, status: "expired" });
}

async function handleRefundSucceeded(body: Record<string, unknown>) {
  const refundId = String(body.id ?? "");
  if (!refundId) return NextResponse.json({ ok: false }, { status: 400 });

  const refund = await prisma.refund.findFirst({
    where: { gatewayReference: refundId },
  });
  if (!refund) return NextResponse.json({ ok: true, ignored: true });

  await prisma.refund.update({
    where: { id: refund.id },
    data: {
      status: "COMPLETED",
      processedAt:
        typeof body.created === "string" ? new Date(body.created) : new Date(),
    },
  });
  return NextResponse.json({ ok: true });
}

async function handleRefundFailed(body: Record<string, unknown>) {
  const refundId = String(body.id ?? "");
  if (!refundId) return NextResponse.json({ ok: false }, { status: 400 });
  const refund = await prisma.refund.findFirst({
    where: { gatewayReference: refundId },
  });
  if (!refund) return NextResponse.json({ ok: true, ignored: true });
  await prisma.refund.update({
    where: { id: refund.id },
    data: { status: "FAILED" },
  });
  return NextResponse.json({ ok: true });
}
