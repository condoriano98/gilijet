import { prisma } from '@/shared/server/db';
import { bookingEventId } from '@/features/marketing/contract';
import { recordBookingEvent } from '@/features/marketing/events';

export type CompleteRefundResult =
  | { ok: true; alreadyCompleted: boolean }
  | { ok: false; reason: 'NOT_FOUND' | 'NOT_APPROVED' };

/**
 * Record that refunded money has actually left: APPROVED or PROCESSING →
 * COMPLETED.
 *
 * DOKU refunds are raised by hand on the DOKU dashboard, so nothing in the
 * system learns when the money went back; this is the admin saying so. It is
 * also the moment the `refund` measurement event is recorded, carrying the
 * original purchase's transaction id. The Payment row is never touched:
 * payment history stays as it was.
 */
export async function markRefundCompleted(args: {
  refundId: string;
  adminId: string;
  note?: string | null;
}): Promise<CompleteRefundResult> {
  return prisma.$transaction(async (tx) => {
    const refund = await tx.refund.findUnique({ where: { id: args.refundId } });
    if (!refund) return { ok: false, reason: 'NOT_FOUND' } as const;
    if (refund.status === 'COMPLETED') return { ok: true, alreadyCompleted: true } as const;

    const processedAt = new Date();
    const moved = await tx.refund.updateMany({
      where: { id: refund.id, status: { in: ['APPROVED', 'PROCESSING'] } },
      data: {
        status: 'COMPLETED',
        processedAt,
        ...(args.note ? { adminNote: args.note } : {}),
      },
    });
    if (moved.count === 0) return { ok: false, reason: 'NOT_APPROVED' } as const;

    await tx.auditLog.create({
      data: {
        entityType: 'REFUND',
        entityId: refund.id,
        action: 'completed',
        userRole: 'ADMIN',
        userId: args.adminId,
        previousState: { status: refund.status },
        newState: { status: 'COMPLETED', refundAmount: refund.refundAmount.toString() },
      },
    });

    await recordBookingEvent(tx, 'refund', refund.bookingId, {
      refundId: refund.id,
      occurredAt: processedAt,
      value: refund.refundAmount,
      properties: {
        original_transaction_id: bookingEventId('purchase', refund.bookingId),
        refund_reason: refund.reason,
        partial: refund.refundAmount.lt(refund.originalAmount),
        original_amount: Number(refund.originalAmount),
      },
    });

    return { ok: true, alreadyCompleted: false } as const;
  });
}
