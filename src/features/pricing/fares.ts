/**
 * Operator fare matrices.
 *
 * Operators price on three axes — season, passenger category and one-way vs
 * return — while `Schedule.basePrice` is a single number and `computeBookingPrice`
 * charges one unit price per seat. Rather than discard the rest of a price sheet
 * at import, the whole matrix is kept on `Schedule.fareMatrix` so the numbers
 * survive and checkout can start honouring them without a re-import.
 *
 * `pricing.ts` remains the only thing that computes money; this is storage,
 * validation and the per-leg fare lookup that feeds it.
 */

import type { SeasonType } from '@prisma/client';

export type PassengerCategory = 'adult' | 'child' | 'infant';
export type FareSeason = 'low' | 'high' | 'peak';
export type TripKind = 'oneWay' | 'return';

export type CategoryFares = Record<PassengerCategory, number>;
export type SeasonFares = Record<FareSeason, CategoryFares>;
export type FareMatrix = Record<TripKind, SeasonFares>;

const CATEGORIES: PassengerCategory[] = ['adult', 'child', 'infant'];
const SEASONS: FareSeason[] = ['low', 'high', 'peak'];
const TRIPS: TripKind[] = ['oneWay', 'return'];

function readCategoryFares(raw: unknown): CategoryFares | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const row = raw as Record<string, unknown>;
  const out = {} as CategoryFares;
  for (const category of CATEGORIES) {
    const value = row[category];
    // 0 is meaningful — infants travel free — so only reject non-finite and
    // negative values, never falsy ones.
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
    out[category] = value;
  }
  return out;
}

/** Parse a stored fare matrix, returning null rather than a partial one. */
export function parseFareMatrix(raw: unknown): FareMatrix | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const top = raw as Record<string, unknown>;
  const out = {} as FareMatrix;
  for (const trip of TRIPS) {
    const seasons = top[trip];
    if (typeof seasons !== 'object' || seasons === null) return null;
    const seasonRow = seasons as Record<string, unknown>;
    const parsed = {} as SeasonFares;
    for (const season of SEASONS) {
      const fares = readCategoryFares(seasonRow[season]);
      if (!fares) return null;
      parsed[season] = fares;
    }
    out[trip] = parsed;
  }
  return out;
}

/**
 * The fare `Schedule.basePrice` is expected to mirror. Kept next to the matrix
 * so the two cannot drift on a re-import: an adult, low season, one way.
 */
export function baseFareOf(matrix: FareMatrix): number {
  return matrix.oneWay.low.adult;
}

/** Which part of a booking a leg is. Matches `LegRole` in `booking/helpers.ts`. */
export type FareLegRole = 'ONE_WAY' | 'OUTBOUND' | 'RETURN';

/**
 * Per-category fares for a one-way leg. Without a resolved season (no calendar
 * row, or OFF) it falls back to the low cell — the one `baseFareOf` mirrors
 * into `Schedule.basePrice`.
 */
export function categoryFaresFor(matrix: FareMatrix, season?: SeasonType | null): CategoryFares {
  if (season === 'HIGH') return matrix.oneWay.high;
  if (season === 'PEAK') return matrix.oneWay.peak;
  return matrix.oneWay.low;
}

/**
 * Per-category fares for one leg of a round trip: half of the operator's
 * `return` fare for the leg's own season, so a pair in the same season adds up
 * to exactly the price sheet's return fare. An odd rupiah goes to the outbound
 * leg to keep that sum whole. A pair in different seasons gets the average of
 * the two seasons' return fares.
 */
export function roundTripLegFaresFor(
  matrix: FareMatrix,
  season: SeasonType | null | undefined,
  role: 'OUTBOUND' | 'RETURN',
): CategoryFares {
  const row = season === 'HIGH' ? matrix.return.high : season === 'PEAK' ? matrix.return.peak : matrix.return.low;
  const half = (v: number) => (role === 'OUTBOUND' ? Math.ceil(v / 2) : Math.floor(v / 2));
  return { adult: half(row.adult), child: half(row.child), infant: half(row.infant) };
}
