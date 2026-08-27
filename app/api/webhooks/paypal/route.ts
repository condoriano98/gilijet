import { NextRequest, NextResponse } from "next/server";
import { PaymentMethod } from "@prisma/client";
import { prisma } from "@/lib/db";
import { recordPaymentAwaitingConfirmation } from "@/lib/ticket-issuer";
import { notifyPaymentReceived } from "@/lib/booking-notifications";
import { paypalFeeAsIdr } from "@/lib/psp";
import {
  readCaptureFromWebhook,
  readWebhookHeaders,
  verifyPaypalWebhook,
} from "@/lib/paypal";

/**
 * PayPal webhook endpoint.
 *
 * PayPal POSTs a signed JSON envelope on payment events. We verify it through
 * PayPal's postback endpoint — which requires the raw request bytes, so the
 * body is read as text before any parsing — then converge on the same
 * `confirmPaymentAndIssueTickets` path the Midtrans webhook uses.
 *
 * This is the backstop, not the primary path: the pay page already captures
 * server-side on return from PayPal, so in the normal case this webhook lands
 * after tickets exist and no-ops via `alreadyIssued`.
 *
 * Notification path: /api/webhooks/paypal
 */

export async function GET() {
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  // Raw bytes first — PayPal signs the original serialization, so
  // re-stringifying parsed JSON would fail verification.
  const rawBody = await req.text();

  const verified = await verifyPaypalWebhook({
    headers: readWebhookHeaders(req.headers),
    rawBody,
  });
  if (!verified) {
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

  const eventType = String(payload.event_type ?? "");
  const resource = (payload.resource ?? {}) as Record<string, unknown>;
  const capture = readCaptureFromWebhook(resource);

  const bookingReference = capture.bookingReference;
  if (!bookingReference) {
    // Nothing to correlate against — ack so PayPal stops retrying.
    return NextResponse.json({ ok: true, ignored: true });
  }

  // PayPal's own event id is the natural dedupe key: the same event redelivered
  // carries the same id, whereas a genuine second capture would carry a new one.
  const externalRef = String(payload.id ?? capture.captureId ?? bookingReference);

  const existing = await prisma.webhookEvent.findFirst({
    where: {
      provider: "paypal",
      eventType,
      externalRef,
      status: { in: ["PROCESSED", "PROCESSING"] },
    },
  });
  if (existing) {
    return NextResponse.json({ ok: true, idempotent: true });
  }

  const webhookEvent = await prisma.webhookEvent.create({
    data: {
      provider: "paypal",
      eventType,
      externalRef,
      rawPayload: payload as never,
      status: "PROCESSING",
      attempts: 1,
      lastAttemptAt: new Date(),
    },
  });

  try {
    const result = await handleEvent(eventType, bookingReference, capture, payload);
    await prisma.webhookEvent.update({
      where: { id: webhookEvent.id },
      data: {
        status: result.ok ? "PROCESSED" : "FAILED",
        processedAt: result.ok ? new Date() : undefined,
        errorMessage: result.ok ? null : result.error,
      },
    });
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: result.httpStatus ?? 500 },
      );
    }
    return NextResponse.json({ ok: true, status: result.status });
  } catch (err) {
    console.error("[paypal-webhook] handler error:", err);
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

type HandleResult =
  | { ok: true; status: string }
  | { ok: false; error: string; httpStatus?: number };

async function handleEvent(
  eventType: string,
  bookingReference: string,
  capture: ReturnType<typeof readCaptureFromWebhook>,
  payload: Record<string, unknown>,
): Promise<HandleResult> {
  const booking = await prisma.booking.findUnique({
    where: { bookingReference },
    include: { payment: true },
  });
  if (!booking) {
    // Ack unknown bookings rather than making PayPal retry forever.
    return { ok: true, status: "ignored" };
  }
  const payment = booking.payment;

  switch (eventType) {
    case "PAYMENT.CAPTURE.COMPLETED": {
      if (!capture.completed) return { ok: true, status: "ignored" };

      // Amount integrity, mirroring the Midtrans webhook: never confirm on a
      // capture that doesn't match what we quoted in the presentment currency.
      if (capture.amount && payment?.presentmentAmount) {
        const captured = Number(capture.amount);
        const quoted = Number(payment.presentmentAmount);
        if (!Number.isFinite(captured) || Math.abs(captured - quoted) > 0.01) {
          console.error(
            `[paypal-webhook] amount mismatch for ${bookingReference}: captured=${captured} quoted=${quoted}`,
          );
          return { ok: false, error: "Amount mismatch", httpStatus: 409 };
        }
      }

      const result = await recordPaymentAwaitingConfirmation({
        bookingId: booking.id,
        paidAt: new Date(),
        method: PaymentMethod.PAYPAL,
        gatewayReference: payment?.gatewayReference ?? capture.captureId,
        gatewayFee: paypalFeeAsIdr(capture.feeAmount, payment?.fxRate ?? null),
      });

      if (!result.alreadyRecorded) {
        notifyPaymentReceived(booking.id).catch((err) =>
          console.error("[paypal-webhook] notify failed:", err),
        );
      }

      await prisma.payment.update({
        where: { bookingId: booking.id },
        data: {
          rawWebhookData: payload as never,
          instrumentData: {
            paypalOrderId: payment?.gatewayReference ?? null,
            paypalCaptureId: capture.captureId,
          },
        },
      });

      return { ok: true, status: "awaiting_confirmation" };
    }

    case "PAYMENT.CAPTURE.DENIED":
    case "PAYMENT.CAPTURE.REVERSED": {
      // The customer's money never arrived. Leave the booking PENDING_PAYMENT
      // so the existing hold timer decides its fate — a failed attempt is not
      // terminal, exactly as a Midtrans non-success notification is treated.
      if (payment) {
        await prisma.payment.update({
          where: { bookingId: booking.id },
          data: {
            status: "FAILED",
            failedReason: `PayPal ${eventType}`,
            rawWebhookData: payload as never,
          },
        });
      }
      return { ok: true, status: "failed" };
    }

    case "PAYMENT.CAPTURE.REFUNDED": {
      // Reconciliation only — the refund itself is driven from /admin/refunds.
      // Recording the payload keeps the audit trail complete when a refund is
      // issued from the PayPal dashboard instead.
      if (payment) {
        await prisma.payment.update({
          where: { bookingId: booking.id },
          data: { rawWebhookData: payload as never },
        });
      }
      return { ok: true, status: "refund-recorded" };
    }

    default:
      return { ok: true, status: "ignored" };
  }
}
