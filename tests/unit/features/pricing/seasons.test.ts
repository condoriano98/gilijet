import { describe, it, expect } from 'vitest';
import type { SeasonType } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { resolveSeason, seasonForDeparture, resolveLegFares, withSeasonPrice, adultFareFromSnapshot, legPricingInputs, type SeasonRange } from '@/features/pricing/seasons';
import { categoryFaresFor, type FareMatrix } from '@/features/pricing/fares';

const range = (type: SeasonType, start: string, end: string): SeasonRange => ({
  type,
  startDate: new Date(`${start}T00:00:00Z`),
  endDate: new Date(`${end}T00:00:00Z`),
});

const CALENDAR: SeasonRange[] = [
  range('PEAK', '2026-12-25', '2026-12-25'),
  range('PEAK', '2027-01-01', '2027-01-02'),
  range('HIGH', '2027-01-03', '2027-01-31'),
  range('HIGH', '2026-12-01', '2026-12-31'),
  range('LOW', '2027-02-01', '2027-02-28'),
  range('LOW', '2027-03-01', '2027-03-31'),
  range('OFF', '2027-03-27', '2027-03-27'),
];

describe('resolveSeason', () => {
  it('PEAK wins over HIGH on 25 Dec', () => {
    expect(resolveSeason('2026-12-25', CALENDAR)).toBe('PEAK');
    expect(resolveSeason('2026-12-24', CALENDAR)).toBe('HIGH');
  });

  it('OFF (Nyepi) wins over LOW', () => {
    expect(resolveSeason('2027-03-27', CALENDAR)).toBe('OFF');
    expect(resolveSeason('2027-03-26', CALENDAR)).toBe('LOW');
  });

  it('covers range boundaries inclusively', () => {
    expect(resolveSeason('2027-01-02', CALENDAR)).toBe('PEAK');
    expect(resolveSeason('2027-01-03', CALENDAR)).toBe('HIGH');
    expect(resolveSeason('2027-01-31', CALENDAR)).toBe('HIGH');
    expect(resolveSeason('2027-02-01', CALENDAR)).toBe('LOW');
  });

  it('returns null with no matching row (May–Nov, empty calendar)', () => {
    expect(resolveSeason('2027-05-10', CALENDAR)).toBeNull();
    expect(resolveSeason('2027-05-10', [])).toBeNull();
  });

  it('narrowest range wins between equal-rank seasons', () => {
    const ranges = [range('LOW', '2027-02-01', '2027-02-28'), range('HIGH', '2027-02-10', '2027-02-12')];
    expect(resolveSeason('2027-02-11', ranges)).toBe('HIGH');
    expect(resolveSeason('2027-02-20', ranges)).toBe('LOW');
  });
});

describe('seasonForDeparture', () => {
  it('uses the WITA day, not the UTC day', () => {
    // 06:00 WITA on 25 Dec = 22:00 UTC on 24 Dec.
    expect(seasonForDeparture(new Date('2026-12-24T22:00:00Z'), CALENDAR)).toBe('PEAK');
  });
});

const fares = (adult: number) => ({ adult, child: adult / 2, infant: 0 });
const MATRIX: FareMatrix = {
  oneWay: { low: fares(100), high: fares(200), peak: fares(300) },
  return: { low: fares(100), high: fares(200), peak: fares(300) },
};

describe('categoryFaresFor', () => {
  it('picks the season cell and falls back to low', () => {
    expect(categoryFaresFor(MATRIX, 'HIGH').adult).toBe(200);
    expect(categoryFaresFor(MATRIX, 'PEAK').adult).toBe(300);
    expect(categoryFaresFor(MATRIX, 'LOW').adult).toBe(100);
    expect(categoryFaresFor(MATRIX, null).adult).toBe(100);
    expect(categoryFaresFor(MATRIX).adult).toBe(100);
  });
});

describe('resolveLegFares', () => {
  it('uses the season cell from the schedule fare matrix', () => {
    const leg = { priceOverridden: false, schedule: { fareMatrix: MATRIX } };
    expect(resolveLegFares(leg, 'PEAK')?.adult).toBe(300);
  });

  it('returns null for a manual override so basePrice is used', () => {
    expect(resolveLegFares({ priceOverridden: true, schedule: { fareMatrix: MATRIX } }, 'PEAK')).toBeNull();
  });

  it('returns null when the schedule has no usable fare matrix', () => {
    expect(resolveLegFares({ priceOverridden: false, schedule: { fareMatrix: null } }, 'PEAK')).toBeNull();
  });
});

describe('withSeasonPrice', () => {
  const leg = (id: string, departureDate: string, extra: Partial<{ priceOverridden: boolean }> = {}) => ({
    id,
    basePrice: new Prisma.Decimal(100),
    departureDate: new Date(departureDate),
    priceOverridden: false,
    schedule: { fareMatrix: MATRIX },
    ...extra,
  });

  it('swaps in the season fare and drops OFF days', () => {
    const out = withSeasonPrice(
      [
        leg('peak', '2026-12-25T00:00:00Z'),
        leg('off', '2027-03-27T00:00:00Z'),
        leg('may', '2027-05-10T00:00:00Z'),
        leg('manual', '2026-12-25T00:00:00Z', { priceOverridden: true }),
      ],
      CALENDAR,
    );
    expect(out.map((l) => [l.id, Number(l.basePrice), l.season])).toEqual([
      ['peak', 300, 'PEAK'],
      ['may', 100, null],
      ['manual', 100, null],
    ]);
  });
});

describe('legPricingInputs', () => {
  const overridden = {
    basePrice: new Prisma.Decimal(120),
    departureDate: new Date('2027-03-27T01:00:00Z'),
    priceOverridden: true,
    schedule: { fareMatrix: MATRIX },
  };

  it('reports no season for a hand-priced leg but still closes OFF days', () => {
    const off = legPricingInputs(overridden, CALENDAR);
    expect(off.season).toBeNull();
    expect(off.closed).toBe(true);

    const peak = legPricingInputs({ ...overridden, departureDate: new Date('2026-12-25T01:00:00Z') }, CALENDAR);
    expect(peak.season).toBeNull();
    expect(peak.closed).toBe(false);
    expect(Number(peak.unitPrice)).toBe(120);
  });
});

describe('adultFareFromSnapshot', () => {
  const base = { id: 'leg-1', basePrice: new Prisma.Decimal(100), priceOverridden: false, schedule: { fareMatrix: MATRIX } };

  it('prices from the season recorded on the booking, not the live calendar', () => {
    expect(adultFareFromSnapshot(base, [{ legId: 'leg-1', season: 'HIGH' }])).toBe(200);
  });

  it('falls back to basePrice for bookings without a snapshot', () => {
    expect(adultFareFromSnapshot(base, null)).toBe(100);
  });
});
