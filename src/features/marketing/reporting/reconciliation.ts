import { Prisma, type BookingStatus, type PaymentStatus, type RefundStatus } from '@prisma/client';
import { prisma } from '@/shared/server/db';
import { recordBookingEvent } from '@/features/marketing/events';
import type { EventName } from '@/features/marketing/contract';

/**
 * Ledger-to-marketing reconciliation.
 *
 * The booking/payment/refund/ticket tables are the authority. This compares
 * them with the measurement ledger (MarketingEvent, deliveries, attribution)
 * and reports every disagreement as a structured exception. It reads only.
 * The one repair it offers (repairMissingMarketingEvents) writes nothing but
 * missing MarketingEvent rows: no Booking, Payment, Refund, Ticket or
 * settlement figure is ever changed to make the two agree.
 */
export type ExceptionCode =
  | 'PAID_WITHOUT_PURCHASE_EVENT'
  | 'CONFLICTING_PURCHASE_EVENTS'
  | 'PURCHASE_EVENT_WITHOUT_VERIFIED_PAYMENT'
  | 'PURCHASE_AMOUNT_MISMATCH'
  | 'PURCHASE_CURRENCY_MISMATCH'
  | 'REFUND_WITHOUT_EVENT'
  | 'REFUND_EVENT_AMOUNT_MISMATCH'
  | 'FULFILLED_WITHOUT_FULFILLMENT_EVENTS'
  | 'LATE_PAYMENT_ON_CLOSED_BOOKING'
  | 'DELIVERY_PERMANENTLY_FAILED'
  | 'MISSING_ATTRIBUTION'
  | 'EVENT_FOR_MISSING_BOOKING';

export type Severity = 'error' | 'warning' | 'info';

export type ReconciliationException = {
  code: ExceptionCode;
  severity: Severity;
  bookingId: string | null;
  bookingReference: string | null;
  detail: string;
  /** Present when repairMissingMarketingEvents can record what is missing. */
  repairable?: { eventName: EventName; refundId?: string };
};

export type LedgerBooking = {
  id: string;
  bookingReference: string;
  status: BookingStatus;
  salesChannel: string;
  totalAmount: Prisma.Decimal;
  currency: string;
  createdAt: Date;
  ticketCount: number;
  payment: { status: PaymentStatus; paidAt: Date | null; amount: Prisma.Decimal } | null;
  refund: { id: string; status: RefundStatus; refundAmount: Prisma.Decimal } | null;
  hasAttribution: boolean;
  /** A verified DOKU/PayPal success callback was processed for this booking. */
  verifiedCallbackProcessed: boolean;
};

export type LedgerEvent = {
  eventId: string;
  eventName: string;
  bookingId: string | null;
  refundId: string | null;
  value: Prisma.Decimal | null;
  currency: string | null;
};

export type FailedDelivery = { eventId: string; bookingId: string | null; destination: string; lastError: string | null };

export type ReconciliationInput = {
  bookings: LedgerBooking[];
  events: LedgerEvent[];
  failedDeliveries: FailedDelivery[];
  /** Booking ids referenced by events but absent from the Booking table. */
  missingBookingIds: string[];
};

const CLOSED: BookingStatus[] = ['EXPIRED', 'CANCELLED_BY_CUSTOMER', 'CANCELLED_BY_OPERATOR'];

/** Pure: compare and report. */
export function reconcile(input: ReconciliationInput): ReconciliationException[] {
  const out: ReconciliationException[] = [];
  const byBooking = new Map<string, LedgerEvent[]>();
  for (const e of input.events) {
    if (!e.bookingId) continue;
    const list = byBooking.get(e.bookingId) ?? [];
    list.push(e);
    byBooking.set(e.bookingId, list);
  }

  for (const b of input.bookings) {
    const events = byBooking.get(b.id) ?? [];
    const named = (n: string) => events.filter((e) => e.eventName === n);
    const paid = b.payment?.status === 'SUCCESSFUL' && b.payment.paidAt !== null;
    const purchases = named('purchase');
    const ref = { bookingId: b.id, bookingReference: b.bookingReference };

    if (paid && purchases.length === 0) {
      out.push({ ...ref, code: 'PAID_WITHOUT_PURCHASE_EVENT', severity: 'error', detail: 'Verified payment has no internal purchase event', repairable: { eventName: 'purchase' } });
    }
    if (purchases.length > 1) {
      out.push({ ...ref, code: 'CONFLICTING_PURCHASE_EVENTS', severity: 'error', detail: `${purchases.length} purchase events: ${purchases.map((p) => p.eventId).join(', ')}` });
    }
    if (!paid && purchases.length > 0) {
      out.push({ ...ref, code: 'PURCHASE_EVENT_WITHOUT_VERIFIED_PAYMENT', severity: 'error', detail: `Payment status is ${b.payment?.status ?? 'missing'}` });
    }
    if (paid && purchases.length === 1) {
      const p = purchases[0];
      if (p.value === null || !p.value.eq(b.payment!.amount)) {
        out.push({ ...ref, code: 'PURCHASE_AMOUNT_MISMATCH', severity: 'error', detail: `Event ${p.value?.toString() ?? 'null'} vs payment ${b.payment!.amount.toString()}` });
      }
      if (p.currency !== b.currency) {
        out.push({ ...ref, code: 'PURCHASE_CURRENCY_MISMATCH', severity: 'error', detail: `Event ${p.currency ?? 'null'} vs booking ${b.currency}` });
      }
    }

    if (b.refund?.status === 'COMPLETED') {
      const refundEvents = named('refund').filter((e) => e.refundId === b.refund!.id);
      if (refundEvents.length === 0) {
        out.push({ ...ref, code: 'REFUND_WITHOUT_EVENT', severity: 'warning', detail: `Completed refund ${b.refund.id} has no refund event`, repairable: { eventName: 'refund', refundId: b.refund.id } });
      } else if (refundEvents.some((e) => e.value === null || !e.value.eq(b.refund!.refundAmount))) {
        out.push({ ...ref, code: 'REFUND_EVENT_AMOUNT_MISMATCH', severity: 'error', detail: `Refund ${b.refund.refundAmount.toString()} vs event ${refundEvents[0].value?.toString() ?? 'null'}` });
      }
    }

    if (paid && b.status === 'CONFIRMED' && b.ticketCount > 0) {
      for (const n of ['seat_confirmed', 'ticket_issued'] as const) {
        if (named(n).length === 0) {
          out.push({ ...ref, code: 'FULFILLED_WITHOUT_FULFILLMENT_EVENTS', severity: 'warning', detail: `Confirmed and ticketed booking has no ${n} event`, repairable: { eventName: n } });
        }
      }
    }

    if (CLOSED.includes(b.status) && !paid && (b.verifiedCallbackProcessed || named('unmatched_late_payment').length > 0)) {
      out.push({ ...ref, code: 'LATE_PAYMENT_ON_CLOSED_BOOKING', severity: 'error', detail: `Verified payment received while booking was ${b.status}; refund or reinstate by hand` });
    }

    if (paid && b.salesChannel === 'GILIFAST' && !b.hasAttribution) {
      out.push({ ...ref, code: 'MISSING_ATTRIBUTION', severity: 'info', detail: 'Online paid booking without an attribution snapshot (recorded as unknown, never inferred)' });
    }
  }

  for (const d of input.failedDeliveries) {
    out.push({ code: 'DELIVERY_PERMANENTLY_FAILED', severity: 'warning', bookingId: d.bookingId, bookingReference: null, detail: `${d.destination} ${d.eventId}: ${d.lastError ?? 'no error recorded'}` });
  }
  for (const id of input.missingBookingIds) {
    out.push({ code: 'EVENT_FOR_MISSING_BOOKING', severity: 'warning', bookingId: id, bookingReference: null, detail: 'Marketing events reference a booking that does not exist' });
  }
  return out;
}

/** Read-only loader for bookings created in [from, to). */
export async function loadReconciliationInput(range: { from: Date; to: Date }): Promise<ReconciliationInput> {
  const bookings = await prisma.booking.findMany({
    where: { createdAt: { gte: range.from, lt: range.to } },
    select: {
      id: true,
      bookingReference: true,
      status: true,
      salesChannel: true,
      totalAmount: true,
      currency: true,
      createdAt: true,
      _count: { select: { tickets: true } },
      payment: { select: { status: true, paidAt: true, amount: true } },
      refund: { select: { id: true, status: true, refundAmount: true } },
    },
  });
  const ids = bookings.map((b) => b.id);
  const refs = bookings.map((b) => b.bookingReference);
  const [events, attributions, callbacks, failed, rangeEvents] = await Promise.all([
    prisma.marketingEvent.findMany({
      where: { bookingId: { in: ids } },
      select: { eventId: true, eventName: true, bookingId: true, refundId: true, value: true, currency: true },
    }),
    prisma.bookingAttribution.findMany({ where: { bookingId: { in: ids } }, select: { bookingId: true } }),
    prisma.webhookEvent.findMany({
      where: { status: 'PROCESSED', externalRef: { in: refs }, eventType: { in: ['payment.success', 'PAYMENT.CAPTURE.COMPLETED'] } },
      select: { externalRef: true },
    }),
    prisma.marketingEventDelivery.findMany({
      where: { status: 'FAILED', event: { occurredAt: { gte: range.from, lt: range.to } } },
      select: { destination: true, lastError: true, event: { select: { eventId: true, bookingId: true } } },
    }),
    prisma.marketingEvent.findMany({
      where: { occurredAt: { gte: range.from, lt: range.to }, bookingId: { not: null } },
      select: { bookingId: true },
      distinct: ['bookingId'],
    }),
  ]);
  const attributed = new Set(attributions.map((a) => a.bookingId));
  const called = new Set(callbacks.map((c) => c.externalRef));
  const known = new Set(ids);
  const referenced = rangeEvents.map((e) => e.bookingId!).filter((id) => !known.has(id));
  const existing = referenced.length
    ? new Set((await prisma.booking.findMany({ where: { id: { in: referenced } }, select: { id: true } })).map((b) => b.id))
    : new Set<string>();
  return {
    bookings: bookings.map((b) => ({
      id: b.id,
      bookingReference: b.bookingReference,
      status: b.status,
      salesChannel: b.salesChannel,
      totalAmount: b.totalAmount,
      currency: b.currency,
      createdAt: b.createdAt,
      ticketCount: b._count.tickets,
      payment: b.payment,
      refund: b.refund,
      hasAttribution: attributed.has(b.id),
      verifiedCallbackProcessed: called.has(b.bookingReference),
    })),
    events,
    failedDeliveries: failed.map((f) => ({ eventId: f.event.eventId, bookingId: f.event.bookingId, destination: f.destination, lastError: f.lastError })),
    missingBookingIds: referenced.filter((id) => !existing.has(id)),
  };
}

/**
 * Explicit repair, run only by a SUPER_ADMIN action: record the internal
 * events reconciliation found missing. Idempotent (each event's dedupe key
 * makes a second run a no-op), audited, and limited to MarketingEvent rows;
 * timestamps come from the ledger (paidAt, availabilityDecidedAt,
 * processedAt), never from the moment of repair.
 */
export async function repairMissingMarketingEvents(args: {
  exceptions: ReconciliationException[];
  adminId: string;
}): Promise<{ recorded: number; skipped: number }> {
  let recorded = 0;
  let skipped = 0;
  for (const ex of args.exceptions) {
    if (!ex.repairable || !ex.bookingId) {
      skipped++;
      continue;
    }
    const bookingId = ex.bookingId;
    const { eventName, refundId } = ex.repairable;
    const id = await prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({
        where: { id: bookingId },
        select: { availabilityDecidedAt: true, payment: { select: { paidAt: true, amount: true } }, refund: { select: { id: true, processedAt: true, refundAmount: true, originalAmount: true, reason: true } } },
      });
      if (!booking) return null;
      const occurredAt =
        eventName === 'purchase'
          ? booking.payment?.paidAt
          : eventName === 'refund'
            ? booking.refund?.processedAt
            : booking.availabilityDecidedAt;
      if (!occurredAt) return null;
      const eventId = await recordBookingEvent(tx, eventName, bookingId, {
        occurredAt,
        refundId: refundId ?? null,
        value:
          eventName === 'purchase'
            ? booking.payment?.amount ?? null
            : eventName === 'refund'
              ? booking.refund?.refundAmount ?? null
              : undefined,
        properties: { repaired: true },
      });
      if (eventId) {
        await tx.auditLog.create({
          data: {
            entityType: 'BOOKING',
            entityId: bookingId,
            action: 'marketing_event_repaired',
            userRole: 'ADMIN',
            userId: args.adminId,
            newState: { eventName, eventId, exception: ex.code },
          },
        });
      }
      return eventId;
    });
    if (id) recorded++;
    else skipped++;
  }
  return { recorded, skipped };
}
