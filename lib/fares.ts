/**
 * Operator fare matrices.
 *
 * Operators price on three axes — season, passenger category and one-way vs
 * return — while `Schedule.basePrice` is a single number and `computeBookingPrice`
 * charges one unit price per seat. Rather than discard the rest of a price sheet
 * at import, the whole matrix is kept on `Schedule.fareMatrix` so the numbers
 * survive and checkout can start honouring them without a re-import.
 *
 * Nothing here is charged yet. `lib/pricing.ts` remains the only thing that
 * computes money; this is storage and validation.
 */

export type PassengerCategory = "adult" | "child" | "infant";
export type FareSeason = "low" | "high" | "peak";
export type TripKind = "oneWay" | "return";

export type CategoryFares = Record<PassengerCategory, number>;
export type SeasonFares = Record<FareSeason, CategoryFares>;
export type FareMatrix = Record<TripKind, SeasonFares>;

const CATEGORIES: PassengerCategory[] = ["adult", "child", "infant"];
const SEASONS: FareSeason[] = ["low", "high", "peak"];
const TRIPS: TripKind[] = ["oneWay", "return"];

function readCategoryFares(raw: unknown): CategoryFares | null {
  if (typeof raw !== "object" || raw === null) return null;
  const row = raw as Record<string, unknown>;
  const out = {} as CategoryFares;
  for (const category of CATEGORIES) {
    const value = row[category];
    // 0 is meaningful — infants travel free — so only reject non-finite and
    // negative values, never falsy ones.
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
    out[category] = value;
  }
  return out;
}

/** Parse a stored fare matrix, returning null rather than a partial one. */
export function parseFareMatrix(raw: unknown): FareMatrix | null {
  if (typeof raw !== "object" || raw === null) return null;
  const top = raw as Record<string, unknown>;
  const out = {} as FareMatrix;
  for (const trip of TRIPS) {
    const seasons = top[trip];
    if (typeof seasons !== "object" || seasons === null) return null;
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
