import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';

const mocks = vi.hoisted(() => ({ operator: vi.fn(), config: vi.fn() }));
vi.mock('@/shared/server/db', () => ({
  prisma: {
    operator: { findUnique: mocks.operator },
    platformConfig: { findUnique: mocks.config },
  },
}));

import { resolvePlatformPricing } from '@/shared/server/platform-config';

const config = (serviceFeeType: string | null) => ({
  commissionRate: new Prisma.Decimal('0.08'),
  adultMultiplier: new Prisma.Decimal('1'),
  childMultiplier: new Prisma.Decimal('0.5'),
  infantMultiplier: new Prisma.Decimal('0'),
  serviceFeeType,
  serviceFeeValue: new Prisma.Decimal('5'),
});

beforeEach(() => {
  mocks.operator.mockResolvedValue({ commissionRate: new Prisma.Decimal('0.1') });
});

describe('resolvePlatformPricing: service fee', () => {
  it.each(['PERCENT', 'FLAT'] as const)('passes a %s fee through', async (type) => {
    mocks.config.mockResolvedValue(config(type));
    expect((await resolvePlatformPricing('op-1')).serviceFee).toEqual({ type, value: 5 });
  });

  it('has no fee when none is set', async () => {
    mocks.config.mockResolvedValue(config(null));
    expect((await resolvePlatformPricing('op-1')).serviceFee).toBeNull();
  });

  it('ignores NET, which only a coupon can be', async () => {
    mocks.config.mockResolvedValue(config('NET'));
    expect((await resolvePlatformPricing('op-1')).serviceFee).toBeNull();
  });
});
