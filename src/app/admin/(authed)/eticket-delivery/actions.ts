'use server';

import { redirect } from 'next/navigation';
import { requireAdmin } from '@/shared/server/auth';
import { prisma } from '@/shared/server/db';
import {
  NEEDS_REVIEW_PREFIX,
  OPERATOR_TICKET_EVENT,
  OPERATOR_TICKET_PROVIDER,
  processOperatorTicketEmail,
} from '@/features/tickets/operator-ticket-email';
import { settleWebhookEvent } from '@/features/payments/webhook-events';

const BACK = '/admin/eticket-delivery';

/**
 * Forward an unmatched operator ticket email to the booking the admin picked.
 * The claim is a conditional update, so two admins cannot forward it twice; the
 * processor also refuses a Message-ID it has already forwarded.
 */
export async function forwardOperatorEmailAction(formData: FormData) {
  const session = await requireAdmin();
  const id = String(formData.get('id') ?? '');
  const reference = String(formData.get('bookingReference') ?? '').trim().toUpperCase();
  if (!id || !reference) redirect(`${BACK}?error=missing_input`);

  const event = await prisma.webhookEvent.findUnique({ where: { id } });
  if (!event || event.provider !== OPERATOR_TICKET_PROVIDER || event.eventType !== OPERATOR_TICKET_EVENT) redirect(`${BACK}?error=event_not_found`);

  const claimed = await prisma.webhookEvent.updateMany({
    where: { id, status: 'FAILED', errorMessage: { startsWith: NEEDS_REVIEW_PREFIX } },
    data: { status: 'PROCESSING', attempts: { increment: 1 }, lastAttemptAt: new Date() },
  });
  if (claimed.count === 0) redirect(`${BACK}?error=already_in_progress`);

  let outcome = 'forwarded';
  try {
    const result = await processOperatorTicketEmail(
      (event.rawPayload ?? {}) as Record<string, unknown>,
      { forceBookingReference: reference, adminUserId: session.sub },
    );
    await settleWebhookEvent(id, result);
    if (!result.ok || result.status !== 'forwarded') outcome = 'still_failing';
  } catch (err) {
    // Still waiting for a human: keep the row on the Needs review list.
    await settleWebhookEvent(id, {
      ok: false,
      error: `${NEEDS_REVIEW_PREFIX}${err instanceof Error ? err.message : String(err)}`,
    });
    outcome = 'still_failing';
  }
  redirect(`${BACK}?ok=${outcome}`);
}
