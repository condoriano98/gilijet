import { PaymentMethod } from '@prisma/client';
import { prisma } from '@/shared/server/db';
import { recordPaymentAwaitingConfirmation } from '@/features/tickets/ticket-issuer';
import { notifyPaymentReceived } from '@/features/booking/notifications';
import { normalizePaymentMethod, paypalFeeAsIdr } from '@/features/payments/psp';
import { readNotification } from '@/features/payments/doku';
import { readCaptureFromWebhook } from '@/features/payments/paypal';
import {
  BOOKING_NOT_FOUND,
  type ProcessResult,
} from '@/features/payments/webhook-events';

export type { ProcessResult };

/**
 * What a verified gateway callback does to a booking.
 *
 * The routes verify the signature and keep the WebhookEvent record; the work
 * itself lives here so the retry cron and the admin Retry button run exactly the
 * code the first delivery ran. Settling money only moves a booking to
 * AWAITING_CONFIRMATION (see src/features/tickets/ticket-issuer.ts).
 */

// ─── DOKU ───────────────────────────────────────────────────────────────────

/** Handle a successful DOKU notification (already signature-verified). */
export async function processDokuPaymentSuccess(
  payload: Record<string, unknown>,
): Promise<ProcessResult> {
  const notification = readNotification(payload);
  const reference = notification.invoiceNumber;
  if (!reference) return { ok: true, status: 'ignored' };

  const booking = await prisma.booking.findUnique({
    where: { bookingReference: reference },
    select: { id: true, totalAmount: true },
  });
  if (!booking) return { ok: true, status: BOOKING_NOT_FOUND };

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
      return {
        ok: false,
        error: `Amount mismatch: paid ${paid}, owed ${owed}`,
        httpStatus: 409,
      };
    }
  }

  // DOKU always names a channel; the fallback only covers a malformed
  // notification, where guessing bank transfer beats refusing to ticket a
  // customer who has already paid.
  let method: PaymentMethod = PaymentMethod.BANK_TRANSFER;
  try {
    method = normalizePaymentMethod(notification.channelCode ?? 'BANK_TRANSFER');
  } catch {
    console.warn(
      `[doku-webhook] unknown channel ${notification.channelCode} for ${reference}`,
    );
  }

  const result = await recordPaymentAwaitingConfirmation({
    bookingId: booking.id,
    paidAt: new Date(),
    method,
    gatewayReference: notification.identifier ?? reference,
  });

  await prisma.payment.update({
    where: { bookingId: booking.id },
    data: {
      rawWebhookData: payload as never,
      // Clear any earlier decline: this booking is paid, and a stale reason
      // would keep the retry prompt showing on a paid booking.
      failedReason: null,
    },
  });

  if (!result.alreadyRecorded) {
    notifyPaymentReceived(booking.id).catch((err) =>
      console.error('[doku-webhook] notify failed:', err),
    );
  }

  return { ok: true, status: 'awaiting_confirmation' };
}

// ─── PayPal ─────────────────────────────────────────────────────────────────

/** Handle a verified PayPal event. */
export async function processPaypalEvent(
  eventType: string,
  payload: Record<string, unknown>,
): Promise<ProcessResult> {
  const resource = (payload.resource ?? {}) as Record<string, unknown>;
  const capture = readCaptureFromWebhook(resource);

  const bookingReference = capture.bookingReference;
  if (!bookingReference) return { ok: true, status: 'ignored' };

  const booking = await prisma.booking.findUnique({
    where: { bookingReference },
    include: { payment: true },
  });
  if (!booking) return { ok: true, status: BOOKING_NOT_FOUND };
  const payment = booking.payment;

  switch (eventType) {
    case 'PAYMENT.CAPTURE.COMPLETED': {
      if (!capture.completed) return { ok: true, status: 'ignored' };

      // Amount integrity, mirroring DOKU: never confirm on a capture that
      // doesn't match what we quoted in the presentment currency.
      if (capture.amount && payment?.presentmentAmount) {
        const captured = Number(capture.amount);
        const quoted = Number(payment.presentmentAmount);
        if (!Number.isFinite(captured) || Math.abs(captured - quoted) > 0.01) {
          console.error(
            `[paypal-webhook] amount mismatch for ${bookingReference}: captured=${captured} quoted=${quoted}`,
          );
          return {
            ok: false,
            error: `Amount mismatch: captured ${captured}, quoted ${quoted}`,
            httpStatus: 409,
          };
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
          console.error('[paypal-webhook] notify failed:', err),
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

      return { ok: true, status: 'awaiting_confirmation' };
    }

    case 'PAYMENT.CAPTURE.DENIED':
    case 'PAYMENT.CAPTURE.REVERSED': {
      // The customer's money never arrived. Leave the booking PENDING_PAYMENT
      // so the existing hold timer decides its fate — a failed attempt is not
      // terminal, exactly as a DOKU non-success notification is treated.
      // A late or retried DENIED must not flip a payment that already settled.
      if (payment) {
        await prisma.payment.updateMany({
          where: { bookingId: booking.id, status: { not: 'SUCCESSFUL' } },
          data: {
            status: 'FAILED',
            failedReason: `PayPal ${eventType}`,
            rawWebhookData: payload as never,
          },
        });
      }
      return { ok: true, status: 'failed' };
    }

    case 'PAYMENT.CAPTURE.REFUNDED': {
      // Reconciliation only — the refund itself is driven from /admin/refunds.
      // Recording the payload keeps the audit trail complete when a refund is
      // issued from the PayPal dashboard instead.
      if (payment) {
        await prisma.payment.update({
          where: { bookingId: booking.id },
          data: { rawWebhookData: payload as never },
        });
      }
      return { ok: true, status: 'refund-recorded' };
    }

    default:
      return { ok: true, status: 'ignored' };
  }
}

// ─── Dispatch ───────────────────────────────────────────────────────────────

/**
 * Re-run a stored event through the handler its provider and type name. Used by
 * the retry cron and the admin Retry button. An event nothing handles is a
 * failure, never a silent success: the old dispatcher marked unrecognised DOKU
 * payloads PROCESSED without doing anything.
 */
export async function dispatchWebhookEvent(event: {
  provider: string;
  eventType: string;
  rawPayload: unknown;
}): Promise<ProcessResult> {
  const payload = (event.rawPayload ?? {}) as Record<string, unknown>;

  if (event.provider === 'doku' && event.eventType === 'payment.success') {
    return processDokuPaymentSuccess(payload);
  }
  if (event.provider === 'paypal' && event.eventType.startsWith('PAYMENT.CAPTURE.')) {
    return processPaypalEvent(event.eventType, payload);
  }
  return {
    ok: false,
    error: `No handler for ${event.provider} ${event.eventType}`,
  };
}
