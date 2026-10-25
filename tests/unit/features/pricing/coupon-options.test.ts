import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({ schedules: vi.fn(), operators: vi.fn() }));
vi.mock('@/shared/server/db', () => ({
  prisma: {
    schedule: { findMany: mocks.schedules },
    operator: { findMany: mocks.operators },
  },
}));

import { getCouponTargetOptions, withKeptValues } from '@/features/pricing/coupon-options';

beforeEach(() => {
  mocks.schedules.mockReset();
  mocks.operators.mockReset();
});

describe('getCouponTargetOptions', () => {
  it('offers each live route as the value the booking engine compares against', async () => {
    mocks.schedules.mockResolvedValue([
      { originPort: 'Sanur', destinationPort: 'Nusa Penida' },
      { originPort: 'Padang Bai', destinationPort: 'Gili Trawangan' },
    ]);
    mocks.operators.mockResolvedValue([]);

    const { routes } = await getCouponTargetOptions();

    expect(routes).toEqual([
      { value: 'Sanur-Nusa Penida', label: 'Sanur → Nusa Penida' },
      { value: 'Padang Bai-Gili Trawangan', label: 'Padang Bai → Gili Trawangan' },
    ]);
  });

  it('offers operators by company name, keyed by id', async () => {
    mocks.schedules.mockResolvedValue([]);
    mocks.operators.mockResolvedValue([{ id: 'op-1', companyName: 'Wahana Virendra' }]);

    const { operators } = await getCouponTargetOptions();

    expect(operators).toEqual([{ value: 'op-1', label: 'Wahana Virendra' }]);
  });

  it('only looks at live schedules of active boats of active operators', async () => {
    mocks.schedules.mockResolvedValue([]);
    mocks.operators.mockResolvedValue([]);

    await getCouponTargetOptions();

    expect(mocks.schedules).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          status: 'ACTIVE',
          boat: {
            deletedAt: null,
            status: 'ACTIVE',
            operator: { deletedAt: null, status: 'ACTIVE' },
          },
        },
        distinct: ['originPort', 'destinationPort'],
      }),
    );
    expect(mocks.operators).toHaveBeenCalledWith(
      expect.objectContaining({ where: { deletedAt: null, status: 'ACTIVE' } }),
    );
  });
});

describe('withKeptValues', () => {
  const options = [{ value: 'a', label: 'A' }];

  it('keeps a value the coupon holds that is no longer offered', () => {
    expect(withKeptValues(options, ['a', 'gone'])).toEqual([
      { value: 'a', label: 'A' },
      { value: 'gone', label: 'gone (no longer active)' },
    ]);
  });

  it('adds nothing when everything held is still offered', () => {
    expect(withKeptValues(options, ['a'])).toEqual(options);
  });
});
