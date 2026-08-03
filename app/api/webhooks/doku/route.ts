import { NextRequest, NextResponse } from "next/server";
import { PaymentMethod } from "@prisma/client";
import { prisma } from "@/lib/db";
import { confirmPaymentAndIssueTickets } from "@/lib/ticket-issuer";
import { normalizePaymentMethod } from "@/lib/psp";
import {
  readNotification,
  readNotificationHeaders,
  verifyDokuNotification,
} from "@/lib/doku";
import { sendBookingConfirmation } from "@/lib/email";
import { env } from "@/lib/env";

/**
 * DOKU HTTP notification endpoint.
 *
 * DOKU POSTs a signed JSON body when a payment settles. We recompute the
 * signature over the raw request bytes — re-serialising parsed JSON changes the
 * digest — then converge on `confirmPaymentAndIssueTickets`, which is
 * idempotent, so a redelivered notification issues no second set of tickets.
 *
 * Notification path: /api/webhooks/doku
 */

export async function GET() {
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  // Raw bytes first — the signature covers the original serialization.
  const rawBody = await req.text();

  if (
    !verifyDokuNotification({
      headers: readNotificationHeaders(req.headers),
      rawBody,
    })
  ) {
    return NextResponse.json(
      { ok: false, error: "Invalid signature" },
      { status: 401 },
    );
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const notification = readNotification(payload);
  const reference = notification.invoiceNumber;
  if (!reference) {
    // Nothing to correlate against — ack so DOKU stops retrying.
    return NextResponse.json({ ok: true, ignored: true });
  }

  if (!notification.success) {
    // A failed or pending attempt is not terminal: the hold timer still runs
    // and the customer may retry, so the booking is left alone.
    return NextResponse.json({ ok: true, ignored: true });
  }

  const eventType = "payment.success";

  // Idempotency: skip if already processed or in-flight.
  const existing = await prisma.webhookEvent.findFirst({
    where: {
      provider: "doku",
      eventType,
      externalRef: reference,
      status: { in: ["PROCESSED", "PROCESSING"] },
    },
  });
  if (existing) {
    return NextResponse.json({ ok: true, idempotent: true });
  }

  const booking = await prisma.booking.findUnique({
    where: { bookingReference: reference },
    include: {
      leg: { include: { schedule: { include: { boat: true } } } },
      payment: true,
    },
  });
  if (!booking) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  // Amount integrity: never confirm a booking on a mismatched paid amount.
  // The signature already covers the body, but this catches a stale or
  // re-created invoice carrying a different total.
  if (notification.amount !== null) {
    const paid = Math.round(notification.amount);
    const owed = Math.round(Number(booking.totalAmount));
    if (paid !== owed) {
      console.error(
        `[doku-webhook] amount mismatch for ${reference}: paid=${paid} owed=${owed}`,
      );
      return NextResponse.json(
        { ok: false, error: "Amount mismatch" },
        { status: 409 },
      );
    }
  }

  const webhookEvent = await prisma.webhookEvent.create({
    data: {
      provider: "doku",
      eventType,
      externalRef: reference,
      rawPayload: payload as never,
      status: "PROCESSING",
      attempts: 1,
      lastAttemptAt: new Date(),
    },
  });

  try {
    // DOKU always names a channel; the fallback only covers a malformed
    // notification, where guessing bank transfer beats refusing to ticket a
    // customer who has already paid.
    let method: PaymentMethod = PaymentMethod.BANK_TRANSFER;
    try {
      method = normalizePaymentMethod(notification.channelCode ?? "BANK_TRANSFER");
    } catch {
      console.warn(
        `[doku-webhook] unknown channel ${notification.channelCode} for ${reference}`,
      );
    }

    const result = await confirmPaymentAndIssueTickets({
      bookingId: booking.id,
      paidAt: new Date(),
      method,
      gatewayReference: notification.identifier ?? reference,
    });

    await prisma.payment.update({
      where: { bookingId: booking.id },
      data: { rawWebhookData: payload as never },
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
      }).catch((err) => console.error("[doku-webhook] email failed:", err));
    }

    await prisma.webhookEvent.update({
      where: { id: webhookEvent.id },
      data: { status: "PROCESSED", processedAt: new Date(), errorMessage: null },
    });
    return NextResponse.json({ ok: true, status: "confirmed" });
  } catch (err) {
    console.error("[doku-webhook] handler error:", err);
    await prisma.webhookEvent
      .update({
        where: { id: webhookEvent.id },
        data: {
          status: "FAILED",
          errorMessage: err instanceof Error ? err.message : String(err),
        },
      })
      .catch(() => {});
    return NextResponse.json({ ok: false, error: "Handler error" }, { status: 500 });
  }
}
