import { Prisma } from '@prisma/client';

/**
 * A money amount with where it came from. Reporting never turns an unknown
 * into a zero: an unknown carries a null value, the reasons it is unknown,
 * and, where the data allows, bounds.
 *
 * - actual: read from a ledger row (booking pricing, payment, refund).
 * - estimated: derived by a documented model (e.g. campaign spend split by
 *   an allocation weight). Never mixed into an actual total unlabelled.
 * - unknown: the ledger does not hold the fact.
 */
export type Provenance = 'actual' | 'estimated' | 'unknown';

export type Measured = {
  value: Prisma.Decimal | null;
  provenance: Provenance;
  reasons: string[];
  lowerBound?: Prisma.Decimal;
  upperBound?: Prisma.Decimal;
};

export const ZERO = new Prisma.Decimal(0);

export function actual(value: Prisma.Decimal.Value, ...reasons: string[]): Measured {
  return { value: new Prisma.Decimal(value), provenance: 'actual', reasons };
}

export function estimated(value: Prisma.Decimal.Value, ...reasons: string[]): Measured {
  return { value: new Prisma.Decimal(value), provenance: 'estimated', reasons };
}

export function unknown(
  reason: string,
  bounds: { lowerBound?: Prisma.Decimal.Value; upperBound?: Prisma.Decimal.Value } = {},
): Measured {
  return {
    value: null,
    provenance: 'unknown',
    reasons: [reason],
    ...(bounds.lowerBound !== undefined ? { lowerBound: new Prisma.Decimal(bounds.lowerBound) } : {}),
    ...(bounds.upperBound !== undefined ? { upperBound: new Prisma.Decimal(bounds.upperBound) } : {}),
  };
}

/** a − b − c … ; unknown if any term is unknown, with bounds when every term has them. */
export function subtract(base: Measured, ...terms: Measured[]): Measured {
  const all = [base, ...terms];
  if (all.every((m) => m.value !== null)) {
    const reasons = [...new Set(all.flatMap((m) => m.reasons))];
    const value = terms.reduce((acc, t) => acc.sub(t.value!), base.value!);
    const provenance: Provenance = all.some((m) => m.provenance === 'estimated') ? 'estimated' : 'actual';
    return { value, provenance, reasons };
  }
  // Unknown: only the unknown terms explain why.
  const reasons = [...new Set(all.filter((m) => m.value === null).flatMap((m) => m.reasons))];
  // Bounds: the base's range minus each term's range, when every term has one.
  const lo = (m: Measured) => (m.value ?? m.lowerBound ?? null);
  const hi = (m: Measured) => (m.value ?? m.upperBound ?? null);
  let upper: Prisma.Decimal | null = hi(base);
  let lower: Prisma.Decimal | null = lo(base);
  for (const t of terms) {
    upper = upper !== null && lo(t) !== null ? upper.sub(lo(t)!) : null;
    lower = lower !== null && hi(t) !== null ? lower.sub(hi(t)!) : null;
  }
  return {
    value: null,
    provenance: 'unknown',
    reasons,
    ...(upper !== null ? { upperBound: upper } : {}),
    ...(lower !== null ? { lowerBound: lower } : {}),
  };
}

/**
 * Sum over many bookings. `known` is the exact sum of the known values;
 * status says whether that is the whole answer.
 */
export type Aggregate = {
  status: 'complete' | 'partial' | 'unavailable';
  known: Prisma.Decimal;
  knownCount: number;
  unknownCount: number;
  estimatedCount: number;
  /** known + each unknown's upper bound, when every unknown has one. */
  upperBound: Prisma.Decimal | null;
  reasons: string[];
};

export function aggregate(items: Measured[]): Aggregate {
  let known = ZERO;
  let upper: Prisma.Decimal | null = ZERO;
  let knownCount = 0;
  let unknownCount = 0;
  let estimatedCount = 0;
  const reasons = new Set<string>();
  for (const m of items) {
    if (m.value !== null) {
      known = known.add(m.value);
      if (upper !== null) upper = upper.add(m.value);
      knownCount++;
      if (m.provenance === 'estimated') estimatedCount++;
    } else {
      unknownCount++;
      upper = upper !== null && m.upperBound !== undefined ? upper.add(m.upperBound) : null;
      m.reasons.forEach((r) => reasons.add(r));
    }
  }
  const status = unknownCount === 0 ? 'complete' : knownCount === 0 && items.length > 0 ? 'unavailable' : 'partial';
  return { status, known, knownCount, unknownCount, estimatedCount, upperBound: upper, reasons: [...reasons] };
}
