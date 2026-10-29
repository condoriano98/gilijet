import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/shared/server/db';
import {
  processDokuPaymentSuccess,
  recordPaymentFailedEvent,
} from '@/features/payments/webhook-processor';
import {
  beginWebhookEvent,
  failWebhookEvent,
  isOversizedWebhookBody,
  recordRejectedCallback,
  settleWebhookEvent,
} from '@/features/payments/webhook-events';
import {
  readNotification,
  readNotificationHeaders,
  verifyDokuNotification,
} from '@/features/payments/doku';

/**
 * DOKU HTTP notification endpoint.
 *
 * DOKU POSTs a signed JSON body when a payment settles. We recompute the
 * signature over the raw request bytes — re-serialising parsed JSON changes the
 * digest — then hand the payload to `processDokuPaymentSuccess`, which converges
 * on `recordPaymentAwaitingConfirmation`; that is idempotent, so a redelivered
 * notification cannot re-notify the customer. Every outcome, including a
 * rejected signature, leaves a WebhookEvent row for /admin/webhooks.
 *
 * Settling money does not issue a boarding pass: the booking parks in
 * AWAITING_CONFIRMATION until an admin has rung the operator. See
 * src/features/tickets/ticket-issuer.ts.
 *
 * Notification path: /api/webhooks/doku
 */

export async function GET() {
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  if (isOversizedWebhookBody(req.headers)) {
    return NextResponse.json({ ok: false, error: 'Payload too large' }, { status: 413 });
  }
  // Raw bytes first — the signature covers the original serialization.
  const rawBody = await req.text();

  if (
    !verifyDokuNotification({
      headers: readNotificationHeaders(req.headers),
      rawBody,
    })
  ) {
    await recordRejectedCallback({
      provider: 'doku',
      reason: 'Invalid signature',
      rawBody,
    });
    return NextResponse.json(
      { ok: false, error: 'Invalid signature' },
      { status: 401 },
    );
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    await recordRejectedCallback({
      provider: 'doku',
      reason: 'Invalid JSON',
      rawBody,
    });
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const notification = readNotification(payload);
  const reference = notification.invoiceNumber;
  if (!reference) {
    // Nothing to correlate against — ack so DOKU stops retrying.
    return NextResponse.json({ ok: true, ignored: true });
  }

  if (!notification.success) {
    // A failed or pending attempt is not terminal: the hold timer still runs
    // and the customer may retry, so the booking status is left alone. But it
    // is recorded — an unrecorded decline is invisible, and these are what tell
    // us whether the PayPal backup is actually recovering those customers.
    await recordFailedAttempt(reference, notification, payload);
    return NextResponse.json({ ok: true, recorded: notification.status });
  }

  // Idempotency: a delivery already processed or in flight is acknowledged.
  const event = await beginWebhookEvent({
    provider: 'doku',
    eventType: 'payment.success',
    externalRef: reference,
    payload,
  });
  if (event.idempotent) {
    return NextResponse.json({ ok: true, idempotent: true });
  }

  try {
    const result = await processDokuPaymentSuccess(payload);
    await settleWebhookEvent(event.id, result);
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: result.httpStatus ?? 500 },
      );
    }
    return NextResponse.json({ ok: true, status: result.status });
  } catch (err) {
    console.error('[doku-webhook] handler error:', err);
    await failWebhookEvent(event.id, err);
    return NextResponse.json({ ok: false, error: 'Handler error' }, { status: 500 });
  }
}

/**
 * Persist a non-success notification.
 *
 * Deliberately does NOT set Payment.status = FAILED. A decline is not terminal:
 * the hold timer is still running and the customer may retry on another card or
 * switch to a virtual account. Marking the payment failed would misrepresent a
 * booking that is still perfectly payable.
 *
 * externalRef carries DOKU's own transaction id as well as the booking
 * reference, so three retries produce three rows. Keying on the booking alone
 * would dedupe them away and hide exactly the pattern worth seeing.
 */
async function recordFailedAttempt(
  reference: string,
  notification: ReturnType<typeof readNotification>,
  payload: Record<string, unknown>,
): Promise<void> {
  const externalRef = notification.identifier
    ? `${reference}:${notification.identifier}`
    : reference;

  try {
    const already = await prisma.webhookEvent.findFirst({
      where: { provider: 'doku', eventType: 'payment.failed', externalRef },
      select: { id: true },
    });
    if (!already) {
      await prisma.webhookEvent.create({
        data: {
          provider: 'doku',
          eventType: 'payment.failed',
          externalRef,
          rawPayload: payload as never,
          // PROCESSED, not PENDING: this is a record, not work to retry.
          // Leaving it PENDING would have retry-webhooks reprocess declines.
          status: 'PROCESSED',
          attempts: 1,
          lastAttemptAt: new Date(),
          processedAt: new Date(),
          errorMessage: notification.failureReason,
        },
      });
    }

    const booking = await prisma.booking.findUnique({
      where: { bookingReference: reference },
      select: { id: true },
    });
    if (booking) {
      await prisma.payment.updateMany({
        where: { bookingId: booking.id },
        data: {
          failedReason: notification.failureReason ?? notification.status,
        },
      });
      await recordPaymentFailedEvent({
        bookingId: booking.id,
        gateway: 'doku',
        attemptRef: externalRef,
        status: notification.status,
      });
    }
  } catch (err) {
    // Never let bookkeeping turn into a 500 — DOKU would retry the
    // notification, and there is nothing here worth retrying.
    console.error(`[doku-webhook] could not record decline for ${reference}:`, err);
  }
}
