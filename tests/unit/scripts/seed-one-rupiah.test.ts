import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';
import { ONE_RUPIAH_SCHEDULES, assertConfirmedTarget, projectRefFromUrl } from '../../../scripts/lib/one-rupiah';
import { legPricingInputs, type SeasonRange } from '@/features/pricing/seasons';

const POOLER = 'postgresql://postgres.abcdefghijklmnop:pw@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres';
const DIRECT = 'postgresql://postgres:pw@db.abcdefghijklmnop.supabase.co:5432/postgres';

describe('projectRefFromUrl', () => {
  it('reads the ref from the pooler user and from the direct host', () => {
    expect(projectRefFromUrl(POOLER)).toBe('abcdefghijklmnop');
    expect(projectRefFromUrl(DIRECT)).toBe('abcdefghijklmnop');
  });
  it('returns null for anything else', () => {
    expect(projectRefFromUrl('postgresql://x:x@localhost:5432/x')).toBeNull();
    expect(projectRefFromUrl(undefined)).toBeNull();
  });
});

describe('assertConfirmedTarget', () => {
  it('passes only when the typed ref matches', () => {
    expect(assertConfirmedTarget(POOLER, 'abcdefghijklmnop')).toBe('abcdefghijklmnop');
    expect(() => assertConfirmedTarget(POOLER, undefined)).toThrow(/CONFIRM_PROJECT_REF=abcdefghijklmnop/);
    expect(() => assertConfirmedTarget(POOLER, 'other')).toThrow(/CONFIRM_PROJECT_REF/);
  });
  it('refuses a URL it cannot identify', () => {
    expect(() => assertConfirmedTarget('postgresql://x:x@localhost:5432/x', 'x')).toThrow(/project ref/);
  });
});

describe('the Rp 1 schedules', () => {
  const [outbound, back] = ONE_RUPIAH_SCHEDULES;

  it('are Padang Bai to Senggigi and back, on the QA boat, priced 1', () => {
    expect(outbound).toMatchObject({ originPort: 'Padang Bai', destinationPort: 'Senggigi', basePrice: 1 });
    expect(back).toMatchObject({ originPort: 'Senggigi', destinationPort: 'Padang Bai', basePrice: 1 });
    for (const s of ONE_RUPIAH_SCHEDULES) expect(s.boatRegistration).toBe('QA-BOAT-001');
  });

  it('do not reuse a departure time of the real Wahana schedules (08:30, 13:00, 11:15, 15:45)', () => {
    const real = ['08:30', '13:00', '11:15', '15:45'];
    for (const s of ONE_RUPIAH_SCHEDULES) expect(real).not.toContain(s.departureTime);
  });

  it('stay Rp 1 in every season because they have no fare matrix', () => {
    const date = new Date('2026-12-25T00:00:00Z');
    const leg = {
      basePrice: new Prisma.Decimal(outbound.basePrice),
      departureDate: date,
      priceOverridden: false,
      schedule: { fareMatrix: null },
    };
    for (const type of ['LOW', 'HIGH', 'PEAK'] as const) {
      const ranges = [{ type, startDate: date, endDate: date }] as unknown as SeasonRange[];
      const p = legPricingInputs(leg, ranges);
      expect(p.closed).toBe(false);
      expect(Number(p.unitPrice)).toBe(1);
    }
  });
});
