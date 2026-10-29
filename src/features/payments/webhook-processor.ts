import {
  OPERATOR_TICKET_EVENT,
  OPERATOR_TICKET_PROVIDER,
  processOperatorTicketEmail,
} from '@/features/tickets/operator-ticket-email';
import { PaymentMethod } from '@prisma/client';
import { prisma } from '@/shared/server/db';
import { recordPaymentAwaitingConfirmation } from '@/features/tickets/ticket-issuer';
import { notifyPaymentReceived } from '@/features/booking/notifications';
import { afterResponse } from '@/shared/server/after-response';
import { normalizePaymentMethod, paypalFeeAsIdr } from '@/features/payments/psp';
import { readNotification } from '@/features/payments/doku';
import { readCaptureFromWebhook } from '@/features/payments/paypal';
import { recordBookingEventStandalone } from '@/features/marketing/events';
import { kickDeliveries } from '@/features/marketing/delivery/dispatcher';
import {
  BOOKING_NOT_FOUND,
  type ProcessResult,
} from '@/features/payments/webhook-events';
import { DEFAULT_CURRENCY } from '@/shared/constants/locale';

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
    select: { id: true, totalAmount: true, currency: true },
  });
  if (!booking) return { ok: true, status: BOOKING_NOT_FOUND };

  // Currency integrity. The checkout is only ever opened in IDR, so a
  // non-IDR booking or a notification naming another currency cannot be
  // settled on the amount alone.
  if (booking.currency !== DEFAULT_CURRENCY || (notification.currency && notification.currency !== DEFAULT_CURRENCY)) {
    console.error(
      `[doku-webhook] currency mismatch for ${reference}: notification=${notification.currency ?? 'none'} booking=${booking.currency}`,
    );
    return {
      ok: false,
      error: `Currency mismatch: ${notification.currency ?? DEFAULT_CURRENCY} vs booking ${booking.currency}`,
      httpStatus: 409,
    };
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
    afterResponse(
      notifyPaymentReceived(booking.id).catch((err) =>
        console.error('[doku-webhook] notify failed:', err),
      ),
    );
    afterResponse(kickDeliveries());
  }

  if (result.alreadyRecorded && isClosedStatus(result.bookingStatus)) {
    // Money arrived for a booking that had already expired or been cancelled.
    // No purchase is recorded; the dashboard's Exceptions view lists these as
    // unmatched payments for an admin to refund or reinstate.
    console.error(`[doku-webhook] payment for closed booking ${reference} (status=${result.bookingStatus})`);
    await recordUnmatchedLatePayment(booking.id, 'doku', result.bookingStatus, notification.amount);
    return { ok: true, status: UNMATCHED_LATE_PAYMENT };
  }

  return { ok: true, status: 'awaiting_confirmation' };
}

/** WebhookEvent outcome for a verified payment on an expired/cancelled booking. */
export const UNMATCHED_LATE_PAYMENT = 'unmatched_late_payment';

function isClosedStatus(status: string): boolean {
  return status === 'EXPIRED' || status === 'CANCELLED_BY_CUSTOMER' || status === 'CANCELLED_BY_OPERATOR';
}

async function recordUnmatchedLatePayment(
  bookingId: string,
  gateway: 'doku' | 'paypal',
  bookingStatus: string,
  amount: number | string | null,
): Promise<void> {
  await recordBookingEventStandalone('unmatched_late_payment', bookingId, {
    value: amount === null ? null : Number(amount),
    properties: { gateway, booking_status: bookingStatus },
  });
}

/**
 * Record a verified failed payment attempt in the measurement ledger. Keyed
 * on the gateway's attempt id so a redelivered decline is not counted twice;
 * internal only (DOKU's own guidance is that a Checkout FAILED is not
 * terminal — the customer can switch method).
 */
export async function recordPaymentFailedEvent(args: {
  bookingId: string;
  gateway: 'doku' | 'paypal';
  attemptRef: string;
  status: string;
}): Promise<void> {
  await recordBookingEventStandalone('payment_failed', args.bookingId, {
    eventId: `payment_failed_${args.gateway}_${args.attemptRef}`.slice(0, 190),
    value: null,
    properties: { gateway: args.gateway, gateway_status: args.status.slice(0, 40) },
  });
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
        afterResponse(
          notifyPaymentReceived(booking.id).catch((err) =>
            console.error('[paypal-webhook] notify failed:', err),
          ),
        );
        afterResponse(kickDeliveries());
      }
      if (result.alreadyRecorded && isClosedStatus(result.bookingStatus)) {
        console.error(`[paypal-webhook] payment for closed booking ${bookingReference} (status=${result.bookingStatus})`);
        await recordUnmatchedLatePayment(booking.id, 'paypal', result.bookingStatus, capture.amount ?? null);
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
      await recordPaymentFailedEvent({
        bookingId: booking.id,
        gateway: 'paypal',
        attemptRef: `${capture.captureId ?? bookingReference}_${eventType}`,
        status: eventType,
      });
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
  if (event.provider === OPERATOR_TICKET_PROVIDER && event.eventType === OPERATOR_TICKET_EVENT) {
    return processOperatorTicketEmail(payload);
  }
  if (event.provider === 'paypal' && event.eventType.startsWith('PAYMENT.CAPTURE.')) {
    return processPaypalEvent(event.eventType, payload);
  }
  return {
    ok: false,
    error: `No handler for ${event.provider} ${event.eventType}`,
  };
}
