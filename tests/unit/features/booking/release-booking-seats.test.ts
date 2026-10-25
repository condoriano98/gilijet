import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';

const tx = {
  booking: { findUnique: vi.fn() },
  promotionRedemption: { findUnique: vi.fn(), deleteMany: vi.fn() },
  promotion: { update: vi.fn() },
  auditLog: { create: vi.fn() },
};

vi.mock('@/shared/server/db', () => ({
  prisma: {
    $transaction: async (fn: (t: unknown) => Promise<unknown>) => fn(tx),
  },
}));

import { releaseBookingSeats } from '@/features/booking/engine';

const redemption = {
  id: 'red-1',
  promotionId: 'promo-1',
  bookingId: 'bk-1',
  amount: new Prisma.Decimal('50000'),
};

beforeEach(() => {
  vi.clearAllMocks();
  tx.auditLog.create.mockResolvedValue({});
  tx.promotion.update.mockResolvedValue({});
  tx.promotionRedemption.deleteMany.mockResolvedValue({ count: 1 });
  tx.promotionRedemption.findUnique.mockResolvedValue(redemption);
  tx.booking.findUnique.mockResolvedValue({
    id: 'bk-1',
    tickets: [],
    notes: JSON.stringify({ passengers: [{ type: 'ADULT' }, { type: 'INFANT' }] }),
  });
});

describe('releaseBookingSeats: coupon', () => {
  it.each(['expired', 'cancelled_by_customer', 'cancelled_by_operator', 'payment_failed'] as const)(
    'gives the coupon back when a booking is released as %s',
    async (reason) => {
      await releaseBookingSeats('bk-1', reason);

      expect(tx.promotion.update).toHaveBeenCalledWith({
        where: { id: 'promo-1' },
        data: { usedCount: { decrement: 1 } },
      });
    },
  );

  it('still logs the seats released', async () => {
    await releaseBookingSeats('bk-1', 'expired');

    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entityType: 'BOOKING',
        action: 'seats_released_expired',
        newState: { quantity: 1 },
      }),
    });
  });

  it('gives the coupon back even when no seat count can be worked out', async () => {
    tx.booking.findUnique.mockResolvedValue({ id: 'bk-1', tickets: [], notes: null });

    await releaseBookingSeats('bk-1', 'expired');

    expect(tx.promotion.update).toHaveBeenCalledTimes(1);
    // No seats to log, so only the coupon release wrote an audit row.
    expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'redemption_released' }),
    });
  });

  it('leaves coupons alone for a booking that used none', async () => {
    tx.promotionRedemption.findUnique.mockResolvedValue(null);

    await releaseBookingSeats('bk-1', 'expired');

    expect(tx.promotion.update).not.toHaveBeenCalled();
  });

  it('does nothing for a booking that does not exist', async () => {
    tx.booking.findUnique.mockResolvedValue(null);

    await releaseBookingSeats('missing', 'expired');

    expect(tx.promotionRedemption.findUnique).not.toHaveBeenCalled();
  });
});
