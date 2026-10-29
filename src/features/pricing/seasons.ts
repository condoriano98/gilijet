import { Prisma, type SeasonType } from '@prisma/client';
import { prisma } from '@/shared/server/db';
import { ymdInZone } from '@/shared/lib/datetime';
import {
  categoryFaresFor,
  parseFareMatrix,
  roundTripLegFaresFor,
  type CategoryFares,
  type FareLegRole,
} from './fares';

export interface SeasonRange {
  type: SeasonType;
  startDate: Date;
  endDate: Date;
}

// OFF closes the day, PEAK beats HIGH/LOW; HIGH and LOW tie and fall through
// to the narrowest range.
const RANK: Record<SeasonType, number> = { OFF: 3, PEAK: 2, HIGH: 1, LOW: 1 };

// Season.startDate/endDate are @db.Date, so the UTC date parts are the calendar day.
const dayKey = (d: Date) => d.toISOString().slice(0, 10);
const spanDays = (r: SeasonRange) => Date.parse(dayKey(r.endDate)) - Date.parse(dayKey(r.startDate));

/** Pure: which season applies to a WITA calendar day (`yyyy-MM-dd`). */
export function resolveSeason(ymd: string, ranges: SeasonRange[]): SeasonType | null {
  let best: SeasonRange | null = null;
  for (const r of ranges) {
    if (dayKey(r.startDate) > ymd || dayKey(r.endDate) < ymd) continue;
    if (
      !best ||
      RANK[r.type] > RANK[best.type] ||
      (RANK[r.type] === RANK[best.type] && spanDays(r) < spanDays(best))
    ) {
      best = r;
    }
  }
  return best?.type ?? null;
}

/** One query for a whole list; resolve each leg with `seasonForDeparture`. */
export async function loadActiveSeasons(
  db: Pick<Prisma.TransactionClient, 'season'> = prisma,
): Promise<SeasonRange[]> {
  return db.season.findMany({
    where: { isActive: true, deletedAt: null },
    select: { type: true, startDate: true, endDate: true },
  });
}

/** Keyed on the WITA day: a 06:00 WITA departure is still the previous day in UTC. */
export function seasonForDeparture(departureDate: Date, ranges: SeasonRange[]): SeasonType | null {
  return resolveSeason(ymdInZone(departureDate), ranges);
}

export async function getSeasonForDate(departureDate: Date): Promise<SeasonType | null> {
  return seasonForDeparture(departureDate, await loadActiveSeasons());
}

export interface LegPricingInputs {
  season: SeasonType | null;
  /** OFF days (e.g. Nyepi) are not sold. */
  closed: boolean;
  /** Adult fare; child/infant come from `categoryUnitPrices` when the matrix prices them. */
  unitPrice: Prisma.Decimal | number;
  categoryUnitPrices?: { CHILD: number; INFANT: number };
}

/** What `computeBookingPriceWithTypes` needs for one leg, season included. */
export function legPricingInputs(
  leg: {
    basePrice: Prisma.Decimal;
    departureDate: Date;
    priceOverridden: boolean;
    schedule: { fareMatrix: unknown };
  },
  ranges: SeasonRange[],
  role: FareLegRole = 'ONE_WAY',
): LegPricingInputs {
  const calendarSeason = seasonForDeparture(leg.departureDate, ranges);
  const fares = resolveLegFares(leg, calendarSeason, role);
  return {
    // A hand-set price did not come from the season, so neither the badge nor
    // the booking snapshot should claim it did. OFF still closes the day.
    season: leg.priceOverridden ? null : calendarSeason,
    closed: calendarSeason === 'OFF',
    unitPrice: fares ? fares.adult : leg.basePrice,
    categoryUnitPrices: fares ? { CHILD: fares.child, INFANT: fares.infant } : undefined,
  };
}

/**
 * Category fares for a leg, or null when the leg should be priced from
 * `basePrice` (manual override, or the schedule has no fare matrix). A leg of a
 * round trip reads the matrix's `return` fare; a hand-set price never gets it.
 */
export function resolveLegFares(
  leg: { priceOverridden: boolean; schedule: { fareMatrix: unknown } },
  season: SeasonType | null,
  role: FareLegRole = 'ONE_WAY',
): CategoryFares | null {
  if (leg.priceOverridden) return null;
  const matrix = parseFareMatrix(leg.schedule.fareMatrix);
  if (!matrix) return null;
  return role === 'ONE_WAY' ? categoryFaresFor(matrix, season) : roundTripLegFaresFor(matrix, season, role);
}

type SeasonPricedLeg = {
  basePrice: Prisma.Decimal;
  departureDate: Date;
  priceOverridden: boolean;
  schedule: { fareMatrix: unknown };
};

/**
 * For display lists: drops OFF-day legs and replaces `basePrice` with the
 * adult fare the booking engine will charge, so every reader of a leg list
 * shows the same number the customer is billed.
 */
export function withSeasonPrice<L extends SeasonPricedLeg>(
  legs: L[],
  ranges: SeasonRange[],
  role: FareLegRole = 'ONE_WAY',
): (L & { season: SeasonType | null })[] {
  const out: (L & { season: SeasonType | null })[] = [];
  for (const leg of legs) {
    const { season, closed, unitPrice } = legPricingInputs(leg, ranges, role);
    if (closed) continue;
    out.push({ ...leg, basePrice: new Prisma.Decimal(unitPrice), season });
  }
  return out;
}

/** Adult fare a leg was sold at, from the season recorded on the booking. */
export function adultFareFromSnapshot(
  leg: { id?: string } & Omit<SeasonPricedLeg, 'departureDate'>,
  snapshot: unknown,
  role: FareLegRole = 'ONE_WAY',
): number {
  const entry = Array.isArray(snapshot)
    ? (snapshot as { legId?: string; season?: SeasonType | null }[]).find((e) => e.legId === leg.id)
    : undefined;
  return Number(resolveLegFares(leg, entry?.season ?? null, role)?.adult ?? leg.basePrice);
}
