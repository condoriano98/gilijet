import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The payment → purchase path: exactly one paid transition and one purchase
 * event per booking, whatever DOKU sends and however often.
 */
const mocks = vi.hoisted(() => ({
  recordBookingEvent: vi.fn(async () => 'purchase_bk-1'),
  recordBookingEventStandalone: vi.fn(async () => null),
  updateMany: vi.fn(),
  paymentUpdate: vi.fn(async () => ({})),
  auditCreate: vi.fn(async () => ({})),
  booking: null as Record<string, unknown> | null,
  bookingFind: vi.fn(),
  record: vi.fn(),
}));

vi.mock('@/features/marketing/events', () => ({
  recordBookingEvent: mocks.recordBookingEvent,
  recordBookingEventStandalone: mocks.recordBookingEventStandalone,
}));
vi.mock('@/shared/server/env', () => ({ env: { QR_HMAC_SECRET: 'test-secret-at-least-32-chars-long-ok' } }));
vi.mock('@/features/booking/engine', () => ({ releaseBookingSeats: vi.fn() }));
vi.mock('@/shared/server/db', () => ({
  prisma: {
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        booking: { findUnique: async () => mocks.booking, updateMany: mocks.updateMany },
        payment: { update: mocks.paymentUpdate },
        auditLog: { create: mocks.auditCreate },
      }),
  },
}));

import { recordPaymentAwaitingConfirmation } from '@/features/tickets/ticket-issuer';

const pendingBooking = () => ({
  id: 'bk-1',
  bookingReference: 'GLJ-AAA111',
  status: 'PENDING_PAYMENT',
  notes: JSON.stringify({ passengers: [{ name: 'Ayu' }, { name: 'Budi' }] }),
  payment: { gatewayReference: 'REF', method: 'QRIS', gatewayFee: null },
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.booking = pendingBooking();
});

describe('recordPaymentAwaitingConfirmation (conditional transition)', () => {
  it('moves PENDING_PAYMENT once and records one purchase event at the paid time', async () => {
    mocks.updateMany.mockResolvedValue({ count: 1 });
    const paidAt = new Date('2026-10-26T03:00:00Z');
    const out = await recordPaymentAwaitingConfirmation({ bookingId: 'bk-1', paidAt });
    expect(out.alreadyRecorded).toBe(false);
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: 'bk-1', status: 'PENDING_PAYMENT' },
      data: { status: 'AWAITING_CONFIRMATION' },
    });
    expect(mocks.recordBookingEvent).toHaveBeenCalledTimes(1);
    expect(mocks.recordBookingEvent).toHaveBeenCalledWith(expect.anything(), 'purchase', 'bk-1', expect.objectContaining({ occurredAt: paidAt }));
  });

  it('records nothing when a concurrent callback already moved the row', async () => {
    // Both callbacks read PENDING_PAYMENT; only one update can match.
    mocks.updateMany.mockResolvedValue({ count: 0 });
    const out = await recordPaymentAwaitingConfirmation({ bookingId: 'bk-1' });
    expect(out.alreadyRecorded).toBe(true);
    expect(mocks.paymentUpdate).not.toHaveBeenCalled();
    expect(mocks.recordBookingEvent).not.toHaveBeenCalled();
  });

  it('is a no-op for a redelivery after the booking moved on, and reports its status', async () => {
    mocks.booking = { ...pendingBooking(), status: 'EXPIRED' };
    const out = await recordPaymentAwaitingConfirmation({ bookingId: 'bk-1' });
    expect(out).toEqual({ bookingReference: 'GLJ-AAA111', alreadyRecorded: true, bookingStatus: 'EXPIRED' });
    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(mocks.recordBookingEvent).not.toHaveBeenCalled();
  });
});
