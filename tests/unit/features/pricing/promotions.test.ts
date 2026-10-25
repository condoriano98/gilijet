import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Prisma } from '@prisma/client';
import {
  validatePromoCode,
  applyPromoCode,
  releasePromoRedemption,
} from '@/features/pricing/promotions';

/**
 * Unit tests for src/features/pricing/promotions.ts
 *
 * Tests promotion validation (code checks, targeting, rules) and atomic
 * redemption with concurrency safety via Prisma transaction locks.
 *
 * Mocking: Prisma queries for promo lookups, redemption counts, first-booking checks
 */

vi.mock('@/shared/server/db', () => ({
  prisma: {
    promotion: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
    promotionRedemption: {
      count: vi.fn(),
      create: vi.fn(),
    },
    booking: {
      findFirst: vi.fn(),
    },
    $queryRaw: vi.fn(),
  },
}));

import { prisma } from '@/shared/server/db';

afterEach(() => {
  vi.clearAllMocks();
});

describe('validatePromoCode', () => {
  describe('Code validation', () => {
    it('rejects empty code', async () => {
      const result = await validatePromoCode('   ', { totalAmount: 100000 });

      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.error).toBe('Enter a promo code');
    });

    it('rejects non-existent code', async () => {
      vi.mocked(prisma.promotion.findUnique).mockResolvedValueOnce(null);

      const result = await validatePromoCode('INVALID', { totalAmount: 100000 });

      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.error).toBe('Invalid promo code');
      expect(prisma.promotion.findUnique).toHaveBeenCalledWith({
        where: { code: 'INVALID' },
      });
    });

    it('normalizes code (trim, uppercase)', async () => {
      vi.mocked(prisma.promotion.findUnique).mockResolvedValueOnce(null);

      await validatePromoCode('  summer2026  ', { totalAmount: 100000 });

      expect(prisma.promotion.findUnique).toHaveBeenCalledWith({
        where: { code: 'SUMMER2026' },
      });
    });
  });

  describe('Status checks', () => {
    it('rejects inactive promo', async () => {
      const mockPromo = {
        id: 'promo-1',
        code: 'INACTIVE',
        isActive: false,
        archivedAt: null,
        startsAt: null,
        expiresAt: null,
        maxUses: null,
        usedCount: 0,
        minAmount: new Prisma.Decimal('0'),
        appliesToOperatorIds: [],
        appliesToRouteCodes: [],
        firstBookingOnly: false,
        discountType: 'PERCENT' as const,
        discountValue: new Prisma.Decimal('10'),
        maxDiscountAmount: null,
        costBearer: 'PLATFORM' as const,
        description: null,
      };

      vi.mocked(prisma.promotion.findUnique).mockResolvedValueOnce(mockPromo as any);

      const result = await validatePromoCode('INACTIVE', { totalAmount: 100000 });

      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.error).toBe('Promo code is inactive');
    });

    it('rejects archived promo', async () => {
      const mockPromo = {
        id: 'promo-1',
        code: 'ARCHIVED',
        isActive: true,
        archivedAt: new Date(),
        startsAt: null,
        expiresAt: null,
        maxUses: null,
        usedCount: 0,
        minAmount: new Prisma.Decimal('0'),
        appliesToOperatorIds: [],
        appliesToRouteCodes: [],
        firstBookingOnly: false,
        discountType: 'PERCENT' as const,
        discountValue: new Prisma.Decimal('10'),
        maxDiscountAmount: null,
        costBearer: 'PLATFORM' as const,
        description: null,
      };

      vi.mocked(prisma.promotion.findUnique).mockResolvedValueOnce(mockPromo as any);

      const result = await validatePromoCode('ARCHIVED', { totalAmount: 100000 });

      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.error).toBe('Promo code is inactive');
    });

    it('rejects not-yet-active promo', async () => {
      const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000); // tomorrow
      const mockPromo = {
        id: 'promo-1',
        code: 'FUTURE',
        isActive: true,
        archivedAt: null,
        startsAt: futureDate,
        expiresAt: null,
        maxUses: null,
        usedCount: 0,
        minAmount: new Prisma.Decimal('0'),
        appliesToOperatorIds: [],
        appliesToRouteCodes: [],
        firstBookingOnly: false,
        discountType: 'PERCENT' as const,
        discountValue: new Prisma.Decimal('10'),
        maxDiscountAmount: null,
        costBearer: 'PLATFORM' as const,
        description: null,
      };

      vi.mocked(prisma.promotion.findUnique).mockResolvedValueOnce(mockPromo as any);

      const result = await validatePromoCode('FUTURE', { totalAmount: 100000 });

      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.error).toBe('Promo code is not active yet');
    });

    it('rejects expired promo', async () => {
      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // yesterday
      const mockPromo = {
        id: 'promo-1',
        code: 'EXPIRED',
        isActive: true,
        archivedAt: null,
        startsAt: null,
        expiresAt: pastDate,
        maxUses: null,
        usedCount: 0,
        minAmount: new Prisma.Decimal('0'),
        appliesToOperatorIds: [],
        appliesToRouteCodes: [],
        firstBookingOnly: false,
        discountType: 'PERCENT' as const,
        discountValue: new Prisma.Decimal('10'),
        maxDiscountAmount: null,
        costBearer: 'PLATFORM' as const,
        description: null,
      };

      vi.mocked(prisma.promotion.findUnique).mockResolvedValueOnce(mockPromo as any);

      const result = await validatePromoCode('EXPIRED', { totalAmount: 100000 });

      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.error).toBe('Promo code has expired');
    });
  });

  describe('Usage limits', () => {
    it('rejects when maxUses exceeded', async () => {
      const mockPromo = {
        id: 'promo-1',
        code: 'LIMITED',
        isActive: true,
        archivedAt: null,
        startsAt: null,
        expiresAt: null,
        maxUses: 5,
        usedCount: 5,
        minAmount: new Prisma.Decimal('0'),
        appliesToOperatorIds: [],
        appliesToRouteCodes: [],
        firstBookingOnly: false,
        discountType: 'PERCENT' as const,
        discountValue: new Prisma.Decimal('10'),
        maxDiscountAmount: null,
        costBearer: 'PLATFORM' as const,
        description: null,
      };

      vi.mocked(prisma.promotion.findUnique).mockResolvedValueOnce(mockPromo as any);

      const result = await validatePromoCode('LIMITED', { totalAmount: 100000 });

      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.error).toBe('Promo code is fully redeemed');
    });

  });

  describe('Discount computation', () => {
    it('computes PERCENT discount correctly', async () => {
      const mockPromo = {
        id: 'promo-1',
        code: 'PERCENT10',
        isActive: true,
        archivedAt: null,
        startsAt: null,
        expiresAt: null,
        maxUses: null,
        usedCount: 0,
        minAmount: new Prisma.Decimal('0'),
        appliesToOperatorIds: [],
        appliesToRouteCodes: [],
        firstBookingOnly: false,
        discountType: 'PERCENT' as const,
        discountValue: new Prisma.Decimal('10'),
        maxDiscountAmount: null,
        costBearer: 'PLATFORM' as const,
        description: null,
      };

      vi.mocked(prisma.promotion.findUnique).mockResolvedValueOnce(mockPromo as any);

      const result = await validatePromoCode('PERCENT10', { totalAmount: 100000 });

      expect(result.valid).toBe(true);
      if (result.valid) expect(result.discountAmount).toBe(10000); // 10% of 100000
    });

    it('computes FLAT discount correctly', async () => {
      const mockPromo = {
        id: 'promo-1',
        code: 'FLAT50',
        isActive: true,
        archivedAt: null,
        startsAt: null,
        expiresAt: null,
        maxUses: null,
        usedCount: 0,
        minAmount: new Prisma.Decimal('0'),
        appliesToOperatorIds: [],
        appliesToRouteCodes: [],
        firstBookingOnly: false,
        discountType: 'FLAT' as const,
        discountValue: new Prisma.Decimal('50000'),
        maxDiscountAmount: null,
        costBearer: 'PLATFORM' as const,
        description: null,
      };

      vi.mocked(prisma.promotion.findUnique).mockResolvedValueOnce(mockPromo as any);

      const result = await validatePromoCode('FLAT50', { totalAmount: 100000 });

      expect(result.valid).toBe(true);
      if (result.valid) expect(result.discountAmount).toBe(50000);
    });

    it('caps PERCENT discount with maxDiscountAmount', async () => {
      const mockPromo = {
        id: 'promo-1',
        code: 'PERCENT25CAP',
        isActive: true,
        archivedAt: null,
        startsAt: null,
        expiresAt: null,
        maxUses: null,
        usedCount: 0,
        minAmount: new Prisma.Decimal('0'),
        appliesToOperatorIds: [],
        appliesToRouteCodes: [],
        firstBookingOnly: false,
        discountType: 'PERCENT' as const,
        discountValue: new Prisma.Decimal('25'),
        maxDiscountAmount: new Prisma.Decimal('20000'),
        costBearer: 'PLATFORM' as const,
        description: null,
      };

      vi.mocked(prisma.promotion.findUnique).mockResolvedValueOnce(mockPromo as any);

      const result = await validatePromoCode('PERCENT25CAP', { totalAmount: 100000 });

      expect(result.valid).toBe(true);
      if (result.valid) {
        // 25% of 100000 = 25000, capped at 20000
        expect(result.discountAmount).toBe(20000);
      }
    });

    it('never discounts more than total amount', async () => {
      const mockPromo = {
        id: 'promo-1',
        code: 'HUGE',
        isActive: true,
        archivedAt: null,
        startsAt: null,
        expiresAt: null,
        maxUses: null,
        usedCount: 0,
        minAmount: new Prisma.Decimal('0'),
        appliesToOperatorIds: [],
        appliesToRouteCodes: [],
        firstBookingOnly: false,
        discountType: 'FLAT' as const,
        discountValue: new Prisma.Decimal('500000'),
        maxDiscountAmount: null,
        costBearer: 'PLATFORM' as const,
        description: null,
      };

      vi.mocked(prisma.promotion.findUnique).mockResolvedValueOnce(mockPromo as any);

      const result = await validatePromoCode('HUGE', { totalAmount: 100000 });

      expect(result.valid).toBe(true);
      if (result.valid) expect(result.discountAmount).toBe(100000); // capped at total
    });
  });

  describe('Targeting', () => {
    it('enforces operator targeting', async () => {
      const mockPromo = {
        id: 'promo-1',
        code: 'OPERATOR',
        isActive: true,
        archivedAt: null,
        startsAt: null,
        expiresAt: null,
        maxUses: null,
        usedCount: 0,
        minAmount: new Prisma.Decimal('0'),
        appliesToOperatorIds: ['op-A', 'op-B'],
        appliesToRouteCodes: [],
        firstBookingOnly: false,
        discountType: 'PERCENT' as const,
        discountValue: new Prisma.Decimal('10'),
        maxDiscountAmount: null,
        costBearer: 'PLATFORM' as const,
        description: null,
      };

      vi.mocked(prisma.promotion.findUnique).mockResolvedValueOnce(mockPromo as any);

      const result = await validatePromoCode('OPERATOR', {
        totalAmount: 100000,
        operatorId: 'op-C',
      });

      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.error).toBe('Promo code not valid for this operator');
    });

    it('enforces route targeting', async () => {
      const mockPromo = {
        id: 'promo-1',
        code: 'ROUTE',
        isActive: true,
        archivedAt: null,
        startsAt: null,
        expiresAt: null,
        maxUses: null,
        usedCount: 0,
        minAmount: new Prisma.Decimal('0'),
        appliesToOperatorIds: [],
        appliesToRouteCodes: ['BLI-SBY', 'BLI-DPS'],
        firstBookingOnly: false,
        discountType: 'PERCENT' as const,
        discountValue: new Prisma.Decimal('10'),
        maxDiscountAmount: null,
        costBearer: 'PLATFORM' as const,
        description: null,
      };

      vi.mocked(prisma.promotion.findUnique).mockResolvedValueOnce(mockPromo as any);

      const result = await validatePromoCode('ROUTE', {
        totalAmount: 100000,
        routeCode: 'SBY-BLI',
      });

      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.error).toBe('Promo code not valid for this route');
    });
  });

  describe('Minimum spend', () => {
    it('rejects booking below minimum amount', async () => {
      const mockPromo = {
        id: 'promo-1',
        code: 'MINSPEND',
        isActive: true,
        archivedAt: null,
        startsAt: null,
        expiresAt: null,
        maxUses: null,
        usedCount: 0,
        minAmount: new Prisma.Decimal('500000'),
        appliesToOperatorIds: [],
        appliesToRouteCodes: [],
        firstBookingOnly: false,
        discountType: 'PERCENT' as const,
        discountValue: new Prisma.Decimal('10'),
        maxDiscountAmount: null,
        costBearer: 'PLATFORM' as const,
        description: null,
      };

      vi.mocked(prisma.promotion.findUnique).mockResolvedValueOnce(mockPromo as any);

      const result = await validatePromoCode('MINSPEND', { totalAmount: 100000 });

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain('Minimum spend');
        expect(result.error).toContain('500.000');
      }
    });
  });

  describe('First booking only', () => {
    const firstOnly = () => ({
      id: 'promo-1',
      code: 'FIRST',
      isActive: true,
      archivedAt: null,
      startsAt: null,
      expiresAt: null,
      maxUses: 100,
      usedCount: 40, // other people have used part of the quota
      minAmount: new Prisma.Decimal('0'),
      appliesToOperatorIds: [],
      appliesToRouteCodes: [],
      firstBookingOnly: true,
      discountType: 'PERCENT' as const,
      discountValue: new Prisma.Decimal('15'),
      maxDiscountAmount: null,
      costBearer: 'PLATFORM' as const,
      description: null,
    });

    beforeEach(() => {
      vi.mocked(prisma.promotion.findUnique).mockResolvedValue(firstOnly() as any);
      vi.mocked(prisma.booking.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.$queryRaw).mockResolvedValue([]);
    });

    it('turns away an email that has booked before', async () => {
      vi.mocked(prisma.booking.findFirst).mockResolvedValueOnce({ id: 'booking-1' } as any);

      const result = await validatePromoCode('FIRST', {
        totalAmount: 100000,
        customerEmail: 'Repeat@Example.com',
      });

      expect(result).toEqual({
        valid: false,
        error: 'Not valid coupon',
        reason: 'FIRST_BOOKING_USED',
      });
      expect(prisma.booking.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [{ customerEmail: 'repeat@example.com' }],
          }),
        }),
      );
    });

    it('turns away a phone number that has booked before, under another email', async () => {
      vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([{ id: 'booking-9' }]);

      const result = await validatePromoCode('FIRST', {
        totalAmount: 100000,
        customerEmail: 'new-address@example.com',
        customerPhone: '+62 812-3456-7890',
      });

      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.reason).toBe('FIRST_BOOKING_USED');
      // The phone is compared as digits, with the trunk "0" after +62 dropped.
      const query = vi.mocked(prisma.$queryRaw).mock.calls[0][0] as unknown as { values: unknown[] };
      expect(query.values).toContain('6281234567890');
    });

    it('lets a buyer who never booked use it although others used part of the quota', async () => {
      const result = await validatePromoCode('FIRST', {
        totalAmount: 100000,
        customerEmail: 'brand-new@example.com',
        customerPhone: '+62 811 000 111',
      });

      expect(result.valid).toBe(true);
      if (result.valid) expect(result.discountAmount).toBe(15000);
    });

    it('still honours the quota for a buyer who never booked', async () => {
      vi.mocked(prisma.promotion.findUnique).mockResolvedValue({
        ...firstOnly(),
        usedCount: 100,
      } as any);

      const result = await validatePromoCode('FIRST', {
        totalAmount: 100000,
        customerEmail: 'brand-new@example.com',
      });

      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.error).toBe('Promo code is fully redeemed');
    });

    it('cannot tell who the buyer is before the form has an email or phone, so it lets the preview pass', async () => {
      const result = await validatePromoCode('FIRST', { totalAmount: 100000 });

      expect(result.valid).toBe(true);
      expect(prisma.booking.findFirst).not.toHaveBeenCalled();
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });
  });

  describe('Context variants', () => {
    it('accepts number as context (totalAmount only)', async () => {
      const mockPromo = {
        id: 'promo-1',
        code: 'SIMPLE',
        isActive: true,
        archivedAt: null,
        startsAt: null,
        expiresAt: null,
        maxUses: null,
        usedCount: 0,
        minAmount: new Prisma.Decimal('0'),
        appliesToOperatorIds: [],
        appliesToRouteCodes: [],
        firstBookingOnly: false,
        discountType: 'PERCENT' as const,
        discountValue: new Prisma.Decimal('10'),
        maxDiscountAmount: null,
        costBearer: 'PLATFORM' as const,
        description: null,
      };

      vi.mocked(prisma.promotion.findUnique).mockResolvedValueOnce(mockPromo as any);

      // Can pass just a number for totalAmount (public preview endpoint)
      const result = await validatePromoCode('SIMPLE', 150000);

      expect(result.valid).toBe(true);
      if (result.valid) expect(result.discountAmount).toBe(15000);
    });
  });
});

describe('applyPromoCode', () => {
  it('increments usage counters in transaction', async () => {
    const mockTx = {
      promotion: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUnique: vi.fn().mockResolvedValue({
          id: 'promo-1',
          maxUses: null,
          firstBookingOnly: false,
        }),
      },
      promotionRedemption: {
        count: vi.fn().mockResolvedValue(0),
        create: vi.fn().mockResolvedValue({}),
      },
    } as any;

    await applyPromoCode('promo-1', mockTx, {
      bookingId: 'booking-1',
      customerEmail: 'user@example.com',
      amount: 50000,
    });

    expect(mockTx.promotion.updateMany).toHaveBeenCalledWith({
      where: { id: 'promo-1', isActive: true, archivedAt: null },
      data: { usedCount: { increment: 1 } },
    });
  });

  it('throws PROMO_INACTIVE when promo becomes inactive', async () => {
    const mockTx = {
      promotion: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    } as any;

    await expect(
      applyPromoCode('promo-1', mockTx, {
        bookingId: 'booking-1',
        customerEmail: 'user@example.com',
        amount: 50000,
      }),
    ).rejects.toThrow('PROMO_INACTIVE');
  });

  it('throws PROMO_EXHAUSTED when exceeding maxUses', async () => {
    const mockTx = {
      promotion: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUnique: vi.fn().mockResolvedValue({
          id: 'promo-1',
          maxUses: 5,
          usedCount: 6, // over limit
          firstBookingOnly: false,
        }),
      },
    } as any;

    await expect(
      applyPromoCode('promo-1', mockTx, {
        bookingId: 'booking-1',
        customerEmail: 'user@example.com',
        amount: 50000,
      }),
    ).rejects.toThrow('PROMO_EXHAUSTED');
  });

  describe('first booking only', () => {
    const firstOnlyTx = (priorRedemptions: number) =>
      ({
        promotion: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          findUnique: vi.fn().mockResolvedValue({
            id: 'promo-1',
            maxUses: 100,
            usedCount: 1,
            firstBookingOnly: true,
          }),
        },
        promotionRedemption: {
          count: vi.fn().mockResolvedValue(priorRedemptions),
          create: vi.fn().mockResolvedValue({}),
        },
      }) as any;

    it('throws PROMO_CUSTOMER_LIMIT when the email or the phone already redeemed it', async () => {
      const tx = firstOnlyTx(1);

      await expect(
        applyPromoCode('promo-1', tx, {
          bookingId: 'booking-2',
          customerEmail: 'Repeat@Example.com',
          customerPhone: '+62 812 3456 7890',
          amount: 50000,
        }),
      ).rejects.toThrow('PROMO_CUSTOMER_LIMIT');

      expect(tx.promotionRedemption.count).toHaveBeenCalledWith({
        where: {
          promotionId: 'promo-1',
          OR: [{ customerEmail: 'repeat@example.com' }, { customerPhone: '6281234567890' }],
        },
      });
      expect(tx.promotionRedemption.create).not.toHaveBeenCalled();
    });

    it('redeems for a buyer nobody else matches', async () => {
      const tx = firstOnlyTx(0);

      await applyPromoCode('promo-1', tx, {
        bookingId: 'booking-3',
        customerEmail: 'new@example.com',
        customerPhone: '+62 811 000 111',
        amount: 50000,
      });

      expect(tx.promotionRedemption.create).toHaveBeenCalled();
    });

    it('does not look at redemptions for a code open to repeat buyers', async () => {
      const tx = firstOnlyTx(5);
      tx.promotion.findUnique.mockResolvedValue({
        id: 'promo-1',
        maxUses: 100,
        usedCount: 1,
        firstBookingOnly: false,
      });

      await applyPromoCode('promo-1', tx, {
        bookingId: 'booking-4',
        customerEmail: 'repeat@example.com',
        amount: 50000,
      });

      expect(tx.promotionRedemption.count).not.toHaveBeenCalled();
    });
  });

  it('creates PromotionRedemption record on success', async () => {
    const mockTx = {
      promotion: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUnique: vi.fn().mockResolvedValue({
          id: 'promo-1',
          maxUses: null,
          usedCount: 1,
          firstBookingOnly: false,
        }),
      },
      promotionRedemption: {
        count: vi.fn().mockResolvedValue(0),
        create: vi.fn().mockResolvedValue({}),
      },
    } as any;

    await applyPromoCode('promo-1', mockTx, {
      bookingId: 'booking-1',
      customerEmail: 'User@Example.com', // should be lowercased
      customerPhone: '+620812 3456 7890', // kept as digits
      customerId: 'cust-1',
      amount: 50000,
    });

    expect(mockTx.promotionRedemption.create).toHaveBeenCalledWith({
      data: {
        promotionId: 'promo-1',
        bookingId: 'booking-1',
        customerEmail: 'user@example.com', // lowercased
        customerPhone: '6281234567890',
        amount: expect.any(Object),
      },
    });
  });
});

function nettPromo(overrides: Record<string, unknown> = {}) {
  return {
    id: 'promo-net',
    code: 'NETT150',
    isActive: true,
    archivedAt: null,
    startsAt: null,
    expiresAt: null,
    maxUses: null,
    usedCount: 0,
    minAmount: new Prisma.Decimal('0'),
    appliesToOperatorIds: [],
    appliesToRouteCodes: [],
    firstBookingOnly: false,
    discountType: 'NET' as const,
    discountValue: new Prisma.Decimal('150000'),
    maxDiscountAmount: null,
    costBearer: 'PLATFORM' as const,
    description: null,
    ...overrides,
  };
}

describe('validatePromoCode: Nett coupons', () => {
  const lookup = (promo: ReturnType<typeof nettPromo>) =>
    vi.mocked(prisma.promotion.findUnique).mockResolvedValueOnce(promo as any);

  it('brings the fare of a seat down to the nett price', async () => {
    lookup(nettPromo());
    const result = await validatePromoCode('NETT150', {
      totalAmount: 200_000,
      seatFares: [200_000],
    });

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.discountAmount).toBe(50_000);
      expect(result.promotion.discountType).toBe('NET');
    }
  });

  it('replaces the fare of the child as well as the adult, at the child\'s own fare', async () => {
    lookup(nettPromo({ discountValue: new Prisma.Decimal('100000') }));
    // Adult 200k + child 120k = 320k; both seats at the nett 100k = 200k.
    const result = await validatePromoCode('NETT100', {
      totalAmount: 320_000,
      seatFares: [200_000, 120_000],
    });

    expect(result.valid).toBe(true);
    if (result.valid) expect(result.discountAmount).toBe(120_000);
  });

  it('leaves a seat that already costs less than the nett price alone', async () => {
    lookup(nettPromo());
    const result = await validatePromoCode('NETT150', {
      totalAmount: 320_000,
      seatFares: [200_000, 120_000],
    });

    expect(result.valid).toBe(true);
    if (result.valid) expect(result.discountAmount).toBe(50_000);
  });

  it('applies the nett price to the seats of each leg of a round trip', async () => {
    lookup(nettPromo());
    // Out 200k + 120k, back 180k + 110k.
    const result = await validatePromoCode('NETT150', {
      totalAmount: 610_000,
      seatFares: [200_000, 120_000, 180_000, 110_000],
    });

    expect(result.valid).toBe(true);
    if (result.valid) expect(result.discountAmount).toBe(80_000);
  });

  it('caps the discount with maxDiscountAmount', async () => {
    lookup(nettPromo({ maxDiscountAmount: new Prisma.Decimal('30000') }));
    const result = await validatePromoCode('NETT150', {
      totalAmount: 200_000,
      seatFares: [200_000],
    });

    expect(result.valid).toBe(true);
    if (result.valid) expect(result.discountAmount).toBe(30_000);
  });

  it('refuses when the nett price is not below any seat fare', async () => {
    lookup(nettPromo());
    const result = await validatePromoCode('NETT150', {
      totalAmount: 150_000,
      seatFares: [150_000],
    });

    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toBe('Promo code gives no discount on this trip');
  });

  it('asks for the passengers when it cannot price the seats', async () => {
    lookup(nettPromo());
    const result = await validatePromoCode('NETT150', { totalAmount: 200_000 });

    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toBe('Add the passengers to use this promo code');
  });
});

describe('validatePromoCode: Percent and Flat work on the seat fares', () => {
  const coupon = (overrides: Record<string, unknown>) =>
    vi.mocked(prisma.promotion.findUnique).mockResolvedValueOnce(
      nettPromo({ code: 'SEATS', ...overrides }) as any,
    );

  it('takes the percent off the adult and child fares only', async () => {
    coupon({ discountType: 'PERCENT', discountValue: new Prisma.Decimal('10') });
    // Seats 200k + 120k; the infant has a 50k fare on this boat and is left out.
    const result = await validatePromoCode('SEATS', {
      totalAmount: 370_000,
      seatFares: [200_000, 120_000],
    });

    expect(result.valid).toBe(true);
    if (result.valid) expect(result.discountAmount).toBe(32_000);
  });

  it('takes a flat amount off, but never more than the seat fares', async () => {
    coupon({ discountType: 'FLAT', discountValue: new Prisma.Decimal('400000') });
    const result = await validatePromoCode('SEATS', {
      totalAmount: 370_000,
      seatFares: [200_000, 120_000],
    });

    expect(result.valid).toBe(true);
    if (result.valid) expect(result.discountAmount).toBe(320_000);
  });

  it('takes a flat amount off as it is when the seats cost more', async () => {
    coupon({ discountType: 'FLAT', discountValue: new Prisma.Decimal('50000') });
    const result = await validatePromoCode('SEATS', {
      totalAmount: 320_000,
      seatFares: [200_000, 120_000],
    });

    expect(result.valid).toBe(true);
    if (result.valid) expect(result.discountAmount).toBe(50_000);
  });

  it('falls back to the whole fare when the seats are not listed', async () => {
    coupon({ discountType: 'PERCENT', discountValue: new Prisma.Decimal('10') });
    const result = await validatePromoCode('SEATS', { totalAmount: 150_000 });

    expect(result.valid).toBe(true);
    if (result.valid) expect(result.discountAmount).toBe(15_000);
  });
});

describe('releasePromoRedemption', () => {
  const redemption = {
    id: 'red-1',
    promotionId: 'promo-1',
    bookingId: 'booking-1',
    amount: new Prisma.Decimal('45000'),
  };

  function makeTx(found: typeof redemption | null, deleted = 1) {
    return {
      promotionRedemption: {
        findUnique: vi.fn().mockResolvedValue(found),
        deleteMany: vi.fn().mockResolvedValue({ count: deleted }),
      },
      promotion: { update: vi.fn().mockResolvedValue({}) },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
  }

  it('returns the use to the code and logs it', async () => {
    const tx = makeTx(redemption);

    const released = await releasePromoRedemption(tx as any, 'booking-1', 'expired');

    expect(released).toBe(true);
    expect(tx.promotionRedemption.findUnique).toHaveBeenCalledWith({
      where: { bookingId: 'booking-1' },
    });
    expect(tx.promotionRedemption.deleteMany).toHaveBeenCalledWith({
      where: { id: 'red-1' },
    });
    expect(tx.promotion.update).toHaveBeenCalledWith({
      where: { id: 'promo-1' },
      data: { usedCount: { decrement: 1 } },
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entityType: 'PROMOTION',
        entityId: 'promo-1',
        action: 'redemption_released',
        newState: expect.objectContaining({ bookingId: 'booking-1', reason: 'expired' }),
      }),
    });
  });

  it('does nothing for a booking that used no coupon', async () => {
    const tx = makeTx(null);

    expect(await releasePromoRedemption(tx as any, 'booking-9', 'expired')).toBe(false);
    expect(tx.promotionRedemption.deleteMany).not.toHaveBeenCalled();
    expect(tx.promotion.update).not.toHaveBeenCalled();
  });

  it('gives back only once when two releases race', async () => {
    const tx = makeTx(redemption, 0); // the other one already deleted the row

    expect(await releasePromoRedemption(tx as any, 'booking-1', 'cancelled_by_customer')).toBe(false);
    expect(tx.promotion.update).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });
});
