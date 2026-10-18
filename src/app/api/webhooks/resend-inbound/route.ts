import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/shared/server/env';
import { verifyResendWebhook } from '@/features/messaging/resend-inbound';
import {
  NEEDS_REVIEW_PREFIX,
  OPERATOR_TICKET_EVENT,
  OPERATOR_TICKET_PROVIDER,
  processOperatorTicketEmail,
} from '@/features/tickets/operator-ticket-email';
import {
  beginWebhookEvent,
  failWebhookEvent,
  isOversizedWebhookBody,
  recordRejectedCallback,
  settleWebhookEvent,
} from '@/features/payments/webhook-events';

/**
 * Resend inbound webhook: the operator's e-ticket email, auto-forwarded from
 * admin@gilifast.com to our Resend receiving address, arrives here as an
 * `email.received` event (metadata only; the body and PDF are fetched from the
 * Receiving API by the processor). The Svix signature is checked on the raw
 * bytes before anything is read or written. Every outcome leaves a WebhookEvent
 * row; an email we cannot match stays FAILED ("Needs review") for
 * /admin/eticket-delivery instead of being guessed.
 *
 * Notification path: /api/webhooks/resend-inbound
 */

export async function GET() {
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  if (isOversizedWebhookBody(req.headers)) {
    return NextResponse.json({ ok: false, error: 'Payload too large' }, { status: 413 });
  }
  const rawBody = await req.text();
  // The header can be missing or chunked, so cap the bytes actually read too.
  if (Buffer.byteLength(rawBody) > 256 * 1024) {
    return NextResponse.json({ ok: false, error: 'Payload too large' }, { status: 413 });
  }

  if (
    !verifyResendWebhook({
      headers: req.headers,
      rawBody,
      secret: env.RESEND_INBOUND_SECRET,
    })
  ) {
    await recordRejectedCallback({
      provider: OPERATOR_TICKET_PROVIDER,
      reason: 'Invalid signature',
      rawBody,
    });
    return NextResponse.json({ ok: false, error: 'Invalid signature' }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    await recordRejectedCallback({
      provider: OPERATOR_TICKET_PROVIDER,
      reason: 'Invalid JSON',
      rawBody,
    });
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const emailId = String((payload.data as { email_id?: unknown } | undefined)?.email_id ?? '');
  if (payload.type !== OPERATOR_TICKET_EVENT || !emailId) {
    // Some other Resend event type: acknowledge so it is not redelivered.
    return NextResponse.json({ ok: true, ignored: true });
  }

  const event = await beginWebhookEvent({
    provider: OPERATOR_TICKET_PROVIDER,
    eventType: OPERATOR_TICKET_EVENT,
    externalRef: emailId,
    payload,
  });
  if (event.idempotent) {
    return NextResponse.json({ ok: true, idempotent: true });
  }

  try {
    const result = await processOperatorTicketEmail(payload);
    await settleWebhookEvent(event.id, result);
    if (!result.ok) {
      // An email we cannot match is not a delivery problem: redelivering it
      // would change nothing, so acknowledge. Anything else (Resend API down,
      // send failed) returns 500 so Resend redelivers.
      const needsReview = result.error.startsWith(NEEDS_REVIEW_PREFIX);
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: needsReview ? 200 : (result.httpStatus ?? 500) },
      );
    }
    return NextResponse.json({ ok: true, status: result.status });
  } catch (err) {
    console.error('[resend-inbound] handler error:', err);
    await failWebhookEvent(event.id, err);
    return NextResponse.json({ ok: false, error: 'Handler error' }, { status: 500 });
  }
}
