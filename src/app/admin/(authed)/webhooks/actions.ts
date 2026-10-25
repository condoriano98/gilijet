'use server';

import { redirect } from 'next/navigation';
import { requireAdmin } from '@/shared/server/auth';
import { prisma } from '@/shared/server/db';
import { audit } from '@/shared/server/audit';
import { dispatchWebhookEvent } from '@/features/payments/webhook-processor';
import {
  failWebhookEvent,
  isRetryableEvent,
  settleWebhookEvent,
} from '@/features/payments/webhook-events';

const BACK = '/admin/webhooks';

/**
 * Re-run a FAILED gateway callback through the same handler the first delivery
 * used. The claim is a conditional update, so two admins (or an admin and the
 * retry cron) cannot process the same event twice.
 */
export async function retryWebhookEventAction(formData: FormData) {
  const session = await requireAdmin();
  const id = String(formData.get('id') ?? '');
  if (!id) redirect(`${BACK}?error=missing_event`);

  const event = await prisma.webhookEvent.findUnique({ where: { id } });
  if (!event) redirect(`${BACK}?error=event_not_found`);
  if (!isRetryableEvent(event.provider, event.eventType)) {
    redirect(`${BACK}?error=not_retryable`);
  }

  const claimed = await prisma.webhookEvent.updateMany({
    where: { id, status: 'FAILED' },
    data: {
      status: 'PROCESSING',
      attempts: { increment: 1 },
      lastAttemptAt: new Date(),
    },
  });
  if (claimed.count === 0) redirect(`${BACK}?error=already_in_progress`);

  let outcome = 'retried';
  try {
    const result = await dispatchWebhookEvent(event);
    await settleWebhookEvent(id, result);
    if (!result.ok) outcome = 'still_failing';
  } catch (err) {
    await failWebhookEvent(id, err);
    outcome = 'still_failing';
  }

  const booking = await prisma.booking.findUnique({
    where: { bookingReference: event.externalRef },
    select: { id: true },
  });
  if (booking) {
    await audit({
      entityType: 'BOOKING',
      entityId: booking.id,
      action: 'webhook_retried',
      userId: session.sub,
      userRole: 'ADMIN',
      newState: { webhookEventId: id, provider: event.provider, outcome },
    });
  }

  redirect(`${BACK}?ok=${outcome}`);
}
