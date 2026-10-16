import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/shared/server/db';
import { env } from '@/shared/server/env';
import { dispatchWebhookEvent } from '@/features/payments/webhook-processor';
import {
  RETRYABLE_EVENTS,
  STUCK_PROCESSING_MS,
  failWebhookEvent,
  settleWebhookEvent,
} from '@/features/payments/webhook-events';

/**
 * Cron job: retries PENDING, FAILED and abandoned PROCESSING webhook events.
 * Called by Vercel cron every 5 minutes.
 * Secured by CRON_SECRET header (set in vercel.json and env).
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!env.CRON_SECRET || authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
  const stuckBefore = new Date(Date.now() - STUCK_PROCESSING_MS);

  // Pick events that need retry: PENDING or FAILED more than 2 min ago with
  // fewer than 5 attempts, or PROCESSING since before the run that held it died.
  const events = await prisma.webhookEvent.findMany({
    where: {
      OR: RETRYABLE_EVENTS.map((r) => ({
        provider: r.provider,
        eventType: { in: r.eventTypes },
      })),
      attempts: { lt: 5 },
      AND: [
        {
          OR: [
            {
              status: { in: ['PENDING', 'FAILED'] },
              lastAttemptAt: { lt: twoMinutesAgo },
            },
            { status: 'PROCESSING', lastAttemptAt: { lt: stuckBefore } },
          ],
        },
      ],
    },
    orderBy: { createdAt: 'asc' },
    take: 20,
  });

  let processed = 0;
  let failed = 0;

  for (const event of events) {
    // Claim it conditionally, so an admin Retry or an overlapping run that got
    // there first is not processed twice.
    const claimed = await prisma.webhookEvent.updateMany({
      where: { id: event.id, status: event.status },
      data: {
        status: 'PROCESSING',
        attempts: { increment: 1 },
        lastAttemptAt: new Date(),
      },
    });
    if (claimed.count === 0) continue;

    try {
      const result = await dispatchWebhookEvent(event);
      await settleWebhookEvent(event.id, result);
      if (result.ok) processed++;
      else failed++;
    } catch (err) {
      await failWebhookEvent(event.id, err);
      failed++;
    }
  }

  console.log(`[retry-webhooks] processed=${processed} failed=${failed} total=${events.length}`);
  return NextResponse.json({ ok: true, processed, failed, total: events.length });
}

export const dynamic = 'force-dynamic';
