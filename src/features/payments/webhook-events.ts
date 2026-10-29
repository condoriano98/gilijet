import { prisma } from '@/shared/server/db';
import { MS_PER_MINUTE } from '@/shared/constants/time';

/**
 * Bookkeeping for the `WebhookEvent` table, shared by the DOKU and PayPal
 * routes, the retry cron and the admin retry action, so every callback leaves
 * the same trail in /admin/webhooks.
 */

export type ProcessResult =
  | { ok: true; status: string }
  | { ok: false; error: string; httpStatus?: number };

/** `ok` result whose booking does not exist: logged as SKIPPED, not PROCESSED. */
export const BOOKING_NOT_FOUND = 'booking-not-found';

/** `ok` result for an inbound email from an address that is not an operator's: logged SKIPPED. */
export const SENDER_NOT_ALLOWED = 'sender-not-allowed';

const SKIP_REASONS: Record<string, string> = {
  [BOOKING_NOT_FOUND]: 'Booking not found',
  [SENDER_NOT_ALLOWED]: 'Sender is not an operator confirmation address',
};

/** Event types a retry can act on. Everything else is a record, not work. */
export const RETRYABLE_EVENTS: { provider: string; eventTypes: string[] }[] = [
  { provider: 'doku', eventTypes: ['payment.success'] },
  { provider: 'imap-inbox', eventTypes: ['email.received'] },
  {
    provider: 'paypal',
    eventTypes: [
      'PAYMENT.CAPTURE.COMPLETED',
      'PAYMENT.CAPTURE.DENIED',
      'PAYMENT.CAPTURE.REVERSED',
      'PAYMENT.CAPTURE.REFUNDED',
    ],
  },
];

export function isRetryableEvent(provider: string, eventType: string): boolean {
  return RETRYABLE_EVENTS.some(
    (r) => r.provider === provider && r.eventTypes.includes(eventType),
  );
}

/** errorMessage prefix of an inbound email that waits for an admin; never retried automatically. */
export const NEEDS_REVIEW_PREFIX = 'Needs review: ';

export const REJECTED_EVENT_TYPE = 'signature.rejected';
const REJECTED_BODY_LIMIT = 4096;
// The endpoints are public and unauthenticated, so the rejected-callback log
// must not become a way to fill the table.
const REJECTED_RATE_LIMIT = 50;
const REJECTED_RATE_WINDOW_MS = 10 * MS_PER_MINUTE;

/** A PROCESSING event untouched this long belongs to a run that died. */
export const STUCK_PROCESSING_MS = 5 * MS_PER_MINUTE;

export type BegunEvent =
  | { idempotent: true }
  | { idempotent: false; id: string };

/**
 * Open (or reopen) the event for a verified callback.
 *
 * A callback already PROCESSED or in flight is idempotent. One that FAILED
 * earlier is reused with attempts + 1, so a gateway redelivering a bad callback
 * shows as one row with a count rather than a row per delivery.
 */
export async function beginWebhookEvent(args: {
  provider: string;
  eventType: string;
  externalRef: string;
  payload: Record<string, unknown>;
}): Promise<BegunEvent> {
  const { provider, eventType, externalRef, payload } = args;
  const existing = await prisma.webhookEvent.findFirst({
    where: { provider, eventType, externalRef },
    orderBy: { createdAt: 'desc' },
    select: { id: true, status: true, lastAttemptAt: true },
  });

  const stuck =
    existing?.status === 'PROCESSING' &&
    existing.lastAttemptAt !== null &&
    Date.now() - existing.lastAttemptAt.getTime() > STUCK_PROCESSING_MS;

  if (existing && !stuck && ['PROCESSED', 'PROCESSING'].includes(existing.status)) {
    return { idempotent: true };
  }

  if (existing && (existing.status === 'FAILED' || stuck)) {
    await prisma.webhookEvent.update({
      where: { id: existing.id },
      data: {
        status: 'PROCESSING',
        rawPayload: payload as never,
        attempts: { increment: 1 },
        lastAttemptAt: new Date(),
      },
    });
    return { idempotent: false, id: existing.id };
  }

  const created = await prisma.webhookEvent.create({
    data: {
      provider,
      eventType,
      externalRef,
      rawPayload: payload as never,
      status: 'PROCESSING',
      attempts: 1,
      lastAttemptAt: new Date(),
    },
  });
  return { idempotent: false, id: created.id };
}

/** Write the outcome of a processor run onto its event. */
export async function settleWebhookEvent(
  id: string,
  result: ProcessResult,
): Promise<void> {
  if (result.ok) {
    const skipReason = SKIP_REASONS[result.status];
    await prisma.webhookEvent.update({
      where: { id },
      data: {
        status: skipReason ? 'SKIPPED' : 'PROCESSED',
        processedAt: new Date(),
        errorMessage: skipReason ?? null,
      },
    });
    return;
  }
  await prisma.webhookEvent.update({
    where: { id },
    data: { status: 'FAILED', errorMessage: result.error },
  });
}

/** Mark an event FAILED after the processor threw. Never throws itself. */
export async function failWebhookEvent(id: string, err: unknown): Promise<void> {
  await prisma.webhookEvent
    .update({
      where: { id },
      data: {
        status: 'FAILED',
        errorMessage: err instanceof Error ? err.message : String(err),
      },
    })
    .catch(() => {});
}

/**
 * Leave a trace of a callback that failed signature verification or could not
 * be parsed. Best effort: it never throws, because the caller is about to answer
 * the gateway and that answer must not depend on bookkeeping.
 */
export async function recordRejectedCallback(args: {
  provider: string;
  reason: string;
  rawBody: string;
  eventType?: string;
}): Promise<void> {
  try {
    const eventType = args.eventType ?? REJECTED_EVENT_TYPE;
    const recent = await prisma.webhookEvent.count({
      where: {
        provider: args.provider,
        eventType,
        createdAt: { gte: new Date(Date.now() - REJECTED_RATE_WINDOW_MS) },
      },
    });
    if (recent >= REJECTED_RATE_LIMIT) return;

    await prisma.webhookEvent.create({
      data: {
        provider: args.provider,
        eventType,
        externalRef: guessReference(args.rawBody),
        rawPayload: {
          truncated: args.rawBody.length > REJECTED_BODY_LIMIT,
          body: args.rawBody.slice(0, REJECTED_BODY_LIMIT),
        },
        status: 'FAILED',
        attempts: 1,
        lastAttemptAt: new Date(),
        errorMessage: args.reason,
      },
    });
  } catch (err) {
    console.error(`[${args.provider}-webhook] could not record rejected callback:`, err);
  }
}

/** Best-effort booking reference from an unverified body, for the log only. */
function guessReference(rawBody: string): string {
  const match = rawBody.match(/BK-\d{4}-\d{2}-[A-Z0-9]{6}/);
  return match ? match[0] : 'unknown';
}

/** Gateway notifications are a few KB; anything this large is not one. */
const MAX_WEBHOOK_BODY_BYTES = 256 * 1024;

export function isOversizedWebhookBody(headers: Headers): boolean {
  return Number(headers.get('content-length') ?? 0) > MAX_WEBHOOK_BODY_BYTES;
}
