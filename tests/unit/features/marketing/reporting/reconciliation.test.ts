import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';

const mocks = vi.hoisted(() => ({
  recordBookingEvent: vi.fn(async () => 'purchase_b1'),
  bookingFindUnique: vi.fn(),
  auditCreate: vi.fn(async () => ({})),
  // Any write to a ledger table would land here and fail the test.
  ledgerWrites: vi.fn(),
}));

vi.mock('@/features/marketing/events', () => ({ recordBookingEvent: mocks.recordBookingEvent }));
vi.mock('@/shared/server/db', () => ({
  prisma: {
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        booking: { findUnique: mocks.bookingFindUnique, update: mocks.ledgerWrites, updateMany: mocks.ledgerWrites },
        payment: { update: mocks.ledgerWrites, updateMany: mocks.ledgerWrites },
        refund: { update: mocks.ledgerWrites, updateMany: mocks.ledgerWrites },
        ticket: { create: mocks.ledgerWrites, updateMany: mocks.ledgerWrites },
        auditLog: { create: mocks.auditCreate },
      }),
  },
}));

import { reconcile, repairMissingMarketingEvents, type LedgerBooking, type ReconciliationInput } from '@/features/marketing/reporting/reconciliation';

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

function booking(over: Partial<LedgerBooking> = {}): LedgerBooking {
  return {
    id: 'b1',
    bookingReference: 'GF-1',
    status: 'AWAITING_CONFIRMATION',
    salesChannel: 'GILIFAST',
    totalAmount: D('500000'),
    currency: 'IDR',
    createdAt: new Date('2026-10-20T00:00:00Z'),
    ticketCount: 0,
    payment: { status: 'SUCCESSFUL', paidAt: new Date('2026-10-20T01:00:00Z'), amount: D('500000') },
    refund: null,
    hasAttribution: true,
    verifiedCallbackProcessed: true,
    ...over,
  };
}

const purchase = (over: Record<string, unknown> = {}) => ({
  eventId: 'purchase_b1',
  eventName: 'purchase',
  bookingId: 'b1',
  refundId: null,
  value: D('500000'),
  currency: 'IDR',
  ...over,
});

const input = (over: Partial<ReconciliationInput>): ReconciliationInput => ({ bookings: [], events: [], failedDeliveries: [], missingBookingIds: [], ...over });
const codes = (i: ReconciliationInput) => reconcile(i).map((e) => e.code);

beforeEach(() => vi.clearAllMocks());

describe('reconcile (read-only)', () => {
  it('a consistent paid booking produces no exception', () => {
    expect(codes(input({ bookings: [booking()], events: [purchase()] }))).toEqual([]);
  });

  it('detects a verified payment with no purchase event, and marks it repairable', () => {
    const out = reconcile(input({ bookings: [booking()] }));
    expect(out).toEqual([expect.objectContaining({ code: 'PAID_WITHOUT_PURCHASE_EVENT', severity: 'error', repairable: { eventName: 'purchase' } })]);
  });

  it('detects conflicting purchase events and purchases without verified payment', () => {
    expect(codes(input({ bookings: [booking()], events: [purchase(), purchase({ eventId: 'purchase_dup' })] }))).toContain('CONFLICTING_PURCHASE_EVENTS');
    expect(codes(input({ bookings: [booking({ payment: { status: 'PENDING', paidAt: null, amount: D('500000') } })], events: [purchase()] }))).toContain(
      'PURCHASE_EVENT_WITHOUT_VERIFIED_PAYMENT',
    );
  });

  it('detects purchase amount and currency disagreeing with the payment ledger', () => {
    const c = codes(input({ bookings: [booking()], events: [purchase({ value: D('450000'), currency: 'USD' })] }));
    expect(c).toEqual(expect.arrayContaining(['PURCHASE_AMOUNT_MISMATCH', 'PURCHASE_CURRENCY_MISMATCH']));
  });

  it('detects completed refunds without a refund event, and refund amount mismatches', () => {
    const refunded = booking({ status: 'CANCELLED_BY_CUSTOMER', refund: { id: 'rf1', status: 'COMPLETED', refundAmount: D('250000') } });
    expect(reconcile(input({ bookings: [refunded], events: [purchase()] }))).toEqual([
      expect.objectContaining({ code: 'REFUND_WITHOUT_EVENT', repairable: { eventName: 'refund', refundId: 'rf1' } }),
    ]);
    const wrong = { eventId: 'refund_rf1', eventName: 'refund', bookingId: 'b1', refundId: 'rf1', value: D('500000'), currency: 'IDR' };
    expect(codes(input({ bookings: [refunded], events: [purchase(), wrong] }))).toEqual(['REFUND_EVENT_AMOUNT_MISMATCH']);
  });

  it('detects confirmed, ticketed bookings missing fulfilment events', () => {
    const c = codes(input({ bookings: [booking({ status: 'CONFIRMED', ticketCount: 2 })], events: [purchase()] }));
    expect(c.filter((x) => x === 'FULFILLED_WITHOUT_FULFILLMENT_EVENTS')).toHaveLength(2);
  });

  it('detects verified payments that arrived on closed bookings', () => {
    const closed = booking({ status: 'EXPIRED', payment: { status: 'PENDING', paidAt: null, amount: D('500000') } });
    expect(codes(input({ bookings: [closed] }))).toEqual(['LATE_PAYMENT_ON_CLOSED_BOOKING']);
    expect(codes(input({ bookings: [{ ...closed, verifiedCallbackProcessed: false }] }))).toEqual([]);
  });

  it('reports failed deliveries, missing attribution and events for missing bookings', () => {
    const c = codes(
      input({
        bookings: [booking({ hasAttribution: false })],
        events: [purchase()],
        failedDeliveries: [{ eventId: 'purchase_b1', bookingId: 'b1', destination: 'META_CAPI', lastError: 'HTTP 400' }],
        missingBookingIds: ['gone'],
      }),
    );
    expect(c).toEqual(expect.arrayContaining(['MISSING_ATTRIBUTION', 'DELIVERY_PERMANENTLY_FAILED', 'EVENT_FOR_MISSING_BOOKING']));
  });

  it('does not ask for attribution on staff channels', () => {
    expect(codes(input({ bookings: [booking({ hasAttribution: false, salesChannel: 'WALK_IN' })], events: [purchase()] }))).toEqual([]);
  });
});

describe('repairMissingMarketingEvents', () => {
  it('records only the missing marketing event, from ledger timestamps, audited, and never writes the ledger', async () => {
    const paidAt = new Date('2026-10-20T01:00:00Z');
    mocks.bookingFindUnique.mockResolvedValue({ availabilityDecidedAt: null, payment: { paidAt, amount: D('500000') }, refund: null });
    const exceptions = reconcile(input({ bookings: [booking()] }));
    const out = await repairMissingMarketingEvents({ exceptions, adminId: 'adm1' });
    expect(out).toEqual({ recorded: 1, skipped: 0 });
    expect(mocks.recordBookingEvent).toHaveBeenCalledWith(
      expect.anything(),
      'purchase',
      'b1',
      expect.objectContaining({ occurredAt: paidAt, properties: { repaired: true } }),
    );
    expect(mocks.auditCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'marketing_event_repaired' }) }));
    expect(mocks.ledgerWrites).not.toHaveBeenCalled();
  });

  it('is idempotent: an event that already exists is skipped and not audited again', async () => {
    mocks.bookingFindUnique.mockResolvedValue({ availabilityDecidedAt: null, payment: { paidAt: new Date(), amount: D(1) }, refund: null });
    mocks.recordBookingEvent.mockResolvedValueOnce(null as never);
    const out = await repairMissingMarketingEvents({ exceptions: reconcile(input({ bookings: [booking()] })), adminId: 'a' });
    expect(out).toEqual({ recorded: 0, skipped: 1 });
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });

  it('skips exceptions that are not repairable (a refund amount mismatch is a human decision)', async () => {
    const out = await repairMissingMarketingEvents({
      exceptions: [{ code: 'REFUND_EVENT_AMOUNT_MISMATCH', severity: 'error', bookingId: 'b1', bookingReference: 'GF-1', detail: 'x' }],
      adminId: 'a',
    });
    expect(out).toEqual({ recorded: 0, skipped: 1 });
    expect(mocks.recordBookingEvent).not.toHaveBeenCalled();
    expect(mocks.ledgerWrites).not.toHaveBeenCalled();
  });
});
