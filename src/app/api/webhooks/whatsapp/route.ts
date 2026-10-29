import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/shared/server/env';
import {
  beginWebhookEvent,
  failWebhookEvent,
  isOversizedWebhookBody,
  recordRejectedCallback,
  settleWebhookEvent,
} from '@/features/payments/webhook-events';
import {
  countInboundMessages,
  extractStatuses,
  verifyChallenge,
  verifySignature,
} from '@/features/messaging/whatsapp-webhook';

/**
 * Meta WhatsApp Cloud API webhook.
 *
 * GET answers Meta's subscription check with the challenge when the verify
 * token matches. POST carries delivery statuses of the messages we sent and
 * replies to them, signed with `X-Hub-Signature-256` (app secret). Statuses are
 * logged to WebhookEvent (provider `whatsapp`) so /admin/webhooks shows whether
 * a PIC message was delivered or why it failed. Replies are only counted: they
 * do not drive anything yet (the "first PIC to answer wins" idea in
 * docs/PIC_CONTACTS.md is not built).
 *
 * Callback path: /api/webhooks/whatsapp
 */

export async function GET(req: NextRequest) {
  if (!env.WHATSAPP_WEBHOOK_VERIFY_TOKEN?.trim()) {
    return NextResponse.json({ ok: false, error: 'Not configured' }, { status: 503 });
  }
  const challenge = verifyChallenge(
    req.nextUrl.searchParams,
    env.WHATSAPP_WEBHOOK_VERIFY_TOKEN,
  );
  if (challenge === null) {
    return NextResponse.json({ ok: false, error: 'Verification failed' }, { status: 403 });
  }
  return new NextResponse(challenge, {
    status: 200,
    headers: { 'content-type': 'text/plain' },
  });
}

export async function POST(req: NextRequest) {
  if (isOversizedWebhookBody(req.headers)) {
    return NextResponse.json({ ok: false, error: 'Payload too large' }, { status: 413 });
  }
  const rawBody = await req.text();

  if (!env.WHATSAPP_APP_SECRET?.trim()) {
    return NextResponse.json({ ok: false, error: 'Not configured' }, { status: 503 });
  }
  if (
    !verifySignature(rawBody, req.headers.get('x-hub-signature-256'), env.WHATSAPP_APP_SECRET)
  ) {
    await recordRejectedCallback({
      provider: 'whatsapp',
      reason: 'Invalid signature',
      rawBody,
    });
    return NextResponse.json({ ok: false, error: 'Invalid signature' }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    await recordRejectedCallback({
      provider: 'whatsapp',
      reason: 'Invalid JSON',
      rawBody,
    });
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  // Always acknowledge a verified delivery: Meta retries on anything but 200,
  // and a bookkeeping failure here must not turn into a retry storm.
  try {
    for (const s of extractStatuses(payload)) {
      const event = await beginWebhookEvent({
        provider: 'whatsapp',
        eventType: `message.${s.status}`,
        externalRef: s.id,
        payload: { id: s.id, status: s.status, timestamp: s.timestamp, error: s.error },
      });
      if (event.idempotent) continue;
      try {
        await settleWebhookEvent(
          event.id,
          s.status === 'failed'
            ? { ok: false, error: s.error ?? 'WhatsApp reported the message as failed' }
            : { ok: true, status: 'recorded' },
        );
      } catch (err) {
        await failWebhookEvent(event.id, err);
      }
    }
    const inbound = countInboundMessages(payload);
    if (inbound > 0) {
      console.log(`[whatsapp-webhook] ${inbound} inbound message(s) received, not stored`);
    }
  } catch (err) {
    console.error('[whatsapp-webhook] bookkeeping failed:', err);
  }
  return NextResponse.json({ ok: true });
}
