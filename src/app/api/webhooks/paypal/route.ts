import { NextRequest, NextResponse } from 'next/server';
import { processPaypalEvent } from '@/features/payments/webhook-processor';
import {
  beginWebhookEvent,
  failWebhookEvent,
  isOversizedWebhookBody,
  recordRejectedCallback,
  settleWebhookEvent,
} from '@/features/payments/webhook-events';
import {
  readCaptureFromWebhook,
  readWebhookHeaders,
  verifyPaypalWebhook,
} from '@/features/payments/paypal';

/**
 * PayPal webhook endpoint.
 *
 * PayPal POSTs a signed JSON envelope on payment events. We verify it through
 * PayPal's postback endpoint — which requires the raw request bytes, so the
 * body is read as text before any parsing — then hand it to
 * `processPaypalEvent`, which converges on the same
 * `recordPaymentAwaitingConfirmation` path the DOKU webhook uses.
 *
 * This is the backstop, not the primary path: the pay page already captures
 * server-side on return from PayPal, so in the normal case this webhook lands
 * after the payment is recorded and no-ops via `alreadyRecorded`.
 *
 * Notification path: /api/webhooks/paypal
 */

export async function GET() {
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  if (isOversizedWebhookBody(req.headers)) {
    return NextResponse.json({ ok: false, error: 'Payload too large' }, { status: 413 });
  }
  // Raw bytes first — PayPal signs the original serialization, so
  // re-stringifying parsed JSON would fail verification.
  const rawBody = await req.text();

  let verified: boolean;
  try {
    verified = await verifyPaypalWebhook({
      headers: readWebhookHeaders(req.headers),
      rawBody,
    });
  } catch (err) {
    // PayPal unreachable: answer 503 so PayPal redelivers instead of dropping it.
    console.error('[paypal-webhook] verification call failed:', err);
    return NextResponse.json({ ok: false, error: 'Verification unavailable' }, { status: 503 });
  }
  if (!verified) {
    await recordRejectedCallback({
      provider: 'paypal',
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
      provider: 'paypal',
      reason: 'Invalid JSON',
      rawBody,
    });
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const eventType = String(payload.event_type ?? '');
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

  const event = await beginWebhookEvent({
    provider: 'paypal',
    eventType,
    externalRef,
    payload,
  });
  if (event.idempotent) {
    return NextResponse.json({ ok: true, idempotent: true });
  }

  try {
    const result = await processPaypalEvent(eventType, payload);
    await settleWebhookEvent(event.id, result);
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: result.httpStatus ?? 500 },
      );
    }
    return NextResponse.json({ ok: true, status: result.status });
  } catch (err) {
    console.error('[paypal-webhook] handler error:', err);
    await failWebhookEvent(event.id, err);
    return NextResponse.json({ ok: false, error: 'Handler error' }, { status: 500 });
  }
}
