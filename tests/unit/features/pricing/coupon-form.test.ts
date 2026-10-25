import { describe, it, expect } from 'vitest';
import { couponRecord, readCouponForm } from '@/features/pricing/coupon-form';

function form(fields: Record<string, string | string[]>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    for (const item of Array.isArray(v) ? v : [v]) fd.append(k, item);
  }
  return fd;
}

/** A valid coupon: 10% off, 100 uses, every route and operator. */
const valid = {
  code: 'summer25',
  discountType: 'PERCENT',
  discountValue: '10',
  maxUses: '100',
  appliesToRouteCodesAll: 'on',
  appliesToOperatorIdsAll: 'on',
};

describe('readCouponForm', () => {
  it('accepts a valid coupon and upper-cases the code', () => {
    const parsed = readCouponForm(form(valid));
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.code).toBe('SUMMER25');
  });

  it('accepts the Nett type', () => {
    const parsed = readCouponForm(
      form({ ...valid, discountType: 'NET', discountValue: '150000' }),
    );
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.discountType).toBe('NET');
  });

  it('rejects an unknown type', () => {
    expect(readCouponForm(form({ ...valid, discountType: 'BOGOF' })).success).toBe(false);
  });

  it('rejects a percent above 100 but not a Nett price above 100', () => {
    expect(readCouponForm(form({ ...valid, discountValue: '101' })).success).toBe(false);
    expect(
      readCouponForm(form({ ...valid, discountType: 'NET', discountValue: '250000' })).success,
    ).toBe(true);
  });

  it('needs Max total uses, because Gilifast pays for every coupon', () => {
    const { maxUses: _drop, ...noQuota } = valid;
    const parsed = readCouponForm(form(noQuota));
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.issues[0].message).toMatch(/Max total uses/);

    // A cap on the discount alone does not bound how many times it is used.
    expect(readCouponForm(form({ ...noQuota, maxDiscountAmount: '50000' })).success).toBe(false);
    expect(readCouponForm(form({ ...valid, maxUses: '0' })).success).toBe(false);
  });

  it('no longer reads a budget cap or a per-customer limit', () => {
    const parsed = readCouponForm(form({ ...valid, budgetCap: '1000000', perCustomerLimit: '2' }));
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      const record = couponRecord(parsed.data);
      expect(record).not.toHaveProperty('budgetCap');
      expect(record).not.toHaveProperty('perCustomerLimit');
      expect(record.maxUses).toBe(100);
    }
  });

  it('needs All or at least one route', () => {
    const { appliesToRouteCodesAll: _all, ...noRoutes } = valid;
    const none = readCouponForm(form(noRoutes));
    expect(none.success).toBe(false);
    if (!none.success) expect(none.error.issues[0].message).toMatch(/route/);

    expect(
      readCouponForm(form({ ...noRoutes, appliesToRouteCodes: ['Sanur-Nusa Penida'] })).success,
    ).toBe(true);
  });

  it('needs All or at least one operator', () => {
    const { appliesToOperatorIdsAll: _all, ...noOperators } = valid;
    const none = readCouponForm(form(noOperators));
    expect(none.success).toBe(false);
    if (!none.success) expect(none.error.issues[0].message).toMatch(/operator/);

    expect(
      readCouponForm(form({ ...noOperators, appliesToOperatorIds: ['op-1', 'op-2'] })).success,
    ).toBe(true);
  });

  it('reads the start and expiry as WITA', () => {
    const parsed = readCouponForm(
      form({ ...valid, startsAt: '2026-12-01T00:00', expiresAt: '2026-12-31T23:59' }),
    );
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.startsAt?.toISOString()).toBe('2026-11-30T16:00:00.000Z');
      expect(parsed.data.expiresAt?.toISOString()).toBe('2026-12-31T15:59:00.000Z');
    }
  });
});

describe('couponRecord', () => {
  const record = (extra: Record<string, string | string[]> = {}, base = valid) => {
    const parsed = readCouponForm(form({ ...base, ...extra }));
    if (!parsed.success) throw new Error(parsed.error.issues[0].message);
    return couponRecord(parsed.data);
  };

  it('always makes the platform pay', () => {
    expect(record().costBearer).toBe('PLATFORM');
  });

  it('stores All as an empty list', () => {
    const r = record();
    expect(r.appliesToRouteCodes).toEqual([]);
    expect(r.appliesToOperatorIds).toEqual([]);
  });

  it('stores the picked routes and operators, de-duplicated', () => {
    const { appliesToRouteCodesAll: _r, appliesToOperatorIdsAll: _o, ...rest } = valid;
    const r = record(
      {
        appliesToRouteCodes: [
          'Sanur-Nusa Penida',
          'Sanur-Nusa Penida',
          'Padang Bai-Gili Trawangan',
        ],
        appliesToOperatorIds: ['op-1'],
      },
      rest as typeof valid,
    );
    expect(r.appliesToRouteCodes).toEqual(['Sanur-Nusa Penida', 'Padang Bai-Gili Trawangan']);
    expect(r.appliesToOperatorIds).toEqual(['op-1']);
  });

  it('ignores a stale list when All is ticked', () => {
    expect(record({ appliesToRouteCodes: ['Sanur-Nusa Penida'] }).appliesToRouteCodes).toEqual([]);
  });
});
