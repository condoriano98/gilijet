import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Prisma } from '@prisma/client';
import { validatePromoCode, applyPromoCode } from '@/lib/promotions';

/**
 * Unit tests for lib/promotions.ts
 *
 * Tests promotion validation (code checks, targeting, rules) and atomic
 * redemption with concurrency safety via Prisma transaction locks.
 *
 * Mocking: Prisma queries for promo lookups, redemption counts, first-booking checks
 */

vi.mock('@/lib/db', () => ({
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
  },
}));

import { prisma } from '@/lib/db';

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
        perCustomerLimit: null,
        firstBookingOnly: false,
        discountType: 'PERCENT' as const,
        discountValue: new Prisma.Decimal('10'),
        maxDiscountAmount: null,
        budgetCap: null,
        budgetSpent: new Prisma.Decimal('0'),
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
        perCustomerLimit: null,
        firstBookingOnly: false,
        discountType: 'PERCENT' as const,
        discountValue: new Prisma.Decimal('10'),
        maxDiscountAmount: null,
        budgetCap: null,
        budgetSpent: new Prisma.Decimal('0'),
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
        perCustomerLimit: null,
        firstBookingOnly: false,
        discountType: 'PERCENT' as const,
        discountValue: new Prisma.Decimal('10'),
        maxDiscountAmount: null,
        budgetCap: null,
        budgetSpent: new Prisma.Decimal('0'),
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
        perCustomerLimit: null,
        firstBookingOnly: false,
        discountType: 'PERCENT' as const,
        discountValue: new Prisma.Decimal('10'),
        maxDiscountAmount: null,
        budgetCap: null,
        budgetSpent: new Prisma.Decimal('0'),
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
        perCustomerLimit: null,
        firstBookingOnly: false,
        discountType: 'PERCENT' as const,
        discountValue: new Prisma.Decimal('10'),
        maxDiscountAmount: null,
        budgetCap: null,
        budgetSpent: new Prisma.Decimal('0'),
        costBearer: 'PLATFORM' as const,
        description: null,
      };

      vi.mocked(prisma.promotion.findUnique).mockResolvedValueOnce(mockPromo as any);

      const result = await validatePromoCode('LIMITED', { totalAmount: 100000 });

      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.error).toBe('Promo code is fully redeemed');
    });

    it('rejects when per-customer limit exceeded', async () => {
      const mockPromo = {
        id: 'promo-1',
        code: 'PERUSER',
        isActive: true,
        archivedAt: null,
        startsAt: null,
        expiresAt: null,
        maxUses: null,
        usedCount: 0,
        minAmount: new Prisma.Decimal('0'),
        appliesToOperatorIds: [],
        appliesToRouteCodes: [],
        perCustomerLimit: 2,
        firstBookingOnly: false,
        discountType: 'PERCENT' as const,
        discountValue: new Prisma.Decimal('10'),
        maxDiscountAmount: null,
        budgetCap: null,
        budgetSpent: new Prisma.Decimal('0'),
        costBearer: 'PLATFORM' as const,
        description: null,
      };

      vi.mocked(prisma.promotion.findUnique).mockResolvedValueOnce(mockPromo as any);
      vi.mocked(prisma.promotionRedemption.count).mockResolvedValueOnce(2);

      const result = await validatePromoCode('PERUSER', {
        totalAmount: 100000,
        customerEmail: 'user@example.com',
      });

      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.error).toBe('You have already used this promo code');
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
        perCustomerLimit: null,
        firstBookingOnly: false,
        discountType: 'PERCENT' as const,
        discountValue: new Prisma.Decimal('10'),
        maxDiscountAmount: null,
        budgetCap: null,
        budgetSpent: new Prisma.Decimal('0'),
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
        perCustomerLimit: null,
        firstBookingOnly: false,
        discountType: 'FLAT' as const,
        discountValue: new Prisma.Decimal('50000'),
        maxDiscountAmount: null,
        budgetCap: null,
        budgetSpent: new Prisma.Decimal('0'),
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
        perCustomerLimit: null,
        firstBookingOnly: false,
        discountType: 'PERCENT' as const,
        discountValue: new Prisma.Decimal('25'),
        maxDiscountAmount: new Prisma.Decimal('20000'),
        budgetCap: null,
        budgetSpent: new Prisma.Decimal('0'),
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
        perCustomerLimit: null,
        firstBookingOnly: false,
        discountType: 'FLAT' as const,
        discountValue: new Prisma.Decimal('500000'),
        maxDiscountAmount: null,
        budgetCap: null,
        budgetSpent: new Prisma.Decimal('0'),
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
        perCustomerLimit: null,
        firstBookingOnly: false,
        discountType: 'PERCENT' as const,
        discountValue: new Prisma.Decimal('10'),
        maxDiscountAmount: null,
        budgetCap: null,
        budgetSpent: new Prisma.Decimal('0'),
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
        perCustomerLimit: null,
        firstBookingOnly: false,
        discountType: 'PERCENT' as const,
        discountValue: new Prisma.Decimal('10'),
        maxDiscountAmount: null,
        budgetCap: null,
        budgetSpent: new Prisma.Decimal('0'),
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
        perCustomerLimit: null,
        firstBookingOnly: false,
        discountType: 'PERCENT' as const,
        discountValue: new Prisma.Decimal('10'),
        maxDiscountAmount: null,
        budgetCap: null,
        budgetSpent: new Prisma.Decimal('0'),
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

  describe('Budget cap', () => {
    it('rejects when budget exhausted', async () => {
      const mockPromo = {
        id: 'promo-1',
        code: 'BUDGET',
        isActive: true,
        archivedAt: null,
        startsAt: null,
        expiresAt: null,
        maxUses: null,
        usedCount: 0,
        minAmount: new Prisma.Decimal('0'),
        appliesToOperatorIds: [],
        appliesToRouteCodes: [],
        perCustomerLimit: null,
        firstBookingOnly: false,
        discountType: 'FLAT' as const,
        discountValue: new Prisma.Decimal('50000'),
        maxDiscountAmount: null,
        budgetCap: new Prisma.Decimal('100000'),
        budgetSpent: new Prisma.Decimal('100000'),
        costBearer: 'PLATFORM' as const,
        description: null,
      };

      vi.mocked(prisma.promotion.findUnique).mockResolvedValueOnce(mockPromo as any);

      const result = await validatePromoCode('BUDGET', { totalAmount: 100000 });

      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.error).toBe('Promo code budget is exhausted');
    });
  });

  describe('First booking only', () => {
    it('rejects when customer has prior booking', async () => {
      const mockPromo = {
        id: 'promo-1',
        code: 'FIRST',
        isActive: true,
        archivedAt: null,
        startsAt: null,
        expiresAt: null,
        maxUses: null,
        usedCount: 0,
        minAmount: new Prisma.Decimal('0'),
        appliesToOperatorIds: [],
        appliesToRouteCodes: [],
        perCustomerLimit: null,
        firstBookingOnly: true,
        discountType: 'PERCENT' as const,
        discountValue: new Prisma.Decimal('15'),
        maxDiscountAmount: null,
        budgetCap: null,
        budgetSpent: new Prisma.Decimal('0'),
        costBearer: 'PLATFORM' as const,
        description: null,
      };

      vi.mocked(prisma.promotion.findUnique).mockResolvedValueOnce(mockPromo as any);
      vi.mocked(prisma.booking.findFirst).mockResolvedValueOnce({ id: 'booking-1' } as any);

      const result = await validatePromoCode('FIRST', {
        totalAmount: 100000,
        customerEmail: 'repeat@example.com',
      });

      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.error).toBe('Promo code is for first bookings only');
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
        perCustomerLimit: null,
        firstBookingOnly: false,
        discountType: 'PERCENT' as const,
        discountValue: new Prisma.Decimal('10'),
        maxDiscountAmount: null,
        budgetCap: null,
        budgetSpent: new Prisma.Decimal('0'),
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
          budgetCap: null,
          budgetSpent: new Prisma.Decimal('0'),
          perCustomerLimit: null,
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
      data: {
        usedCount: { increment: 1 },
        budgetSpent: { increment: expect.any(Object) },
      },
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
          budgetCap: null,
          budgetSpent: new Prisma.Decimal('0'),
          perCustomerLimit: null,
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

  it('throws PROMO_BUDGET_EXHAUSTED when exceeding budgetCap', async () => {
    const mockTx = {
      promotion: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUnique: vi.fn().mockResolvedValue({
          id: 'promo-1',
          maxUses: null,
          usedCount: 1,
          budgetCap: new Prisma.Decimal('100000'),
          budgetSpent: new Prisma.Decimal('100001'), // over limit
          perCustomerLimit: null,
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
    ).rejects.toThrow('PROMO_BUDGET_EXHAUSTED');
  });

  it('throws PROMO_CUSTOMER_LIMIT when exceeding per-customer limit', async () => {
    const mockTx = {
      promotion: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUnique: vi.fn().mockResolvedValue({
          id: 'promo-1',
          maxUses: null,
          usedCount: 1,
          budgetCap: null,
          budgetSpent: new Prisma.Decimal('0'),
          perCustomerLimit: 2,
          firstBookingOnly: false,
        }),
      },
      promotionRedemption: {
        count: vi.fn().mockResolvedValue(2), // already used 2 times
      },
    } as any;

    await expect(
      applyPromoCode('promo-1', mockTx, {
        bookingId: 'booking-1',
        customerEmail: 'user@example.com',
        amount: 50000,
      }),
    ).rejects.toThrow('PROMO_CUSTOMER_LIMIT');
  });

  it('creates PromotionRedemption record on success', async () => {
    const mockTx = {
      promotion: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUnique: vi.fn().mockResolvedValue({
          id: 'promo-1',
          maxUses: null,
          usedCount: 1,
          budgetCap: null,
          budgetSpent: new Prisma.Decimal('0'),
          perCustomerLimit: null,
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
      customerId: 'cust-1',
      amount: 50000,
    });

    expect(mockTx.promotionRedemption.create).toHaveBeenCalledWith({
      data: {
        promotionId: 'promo-1',
        bookingId: 'booking-1',
        customerEmail: 'user@example.com', // lowercased
        amount: expect.any(Object),
      },
    });
  });
});
