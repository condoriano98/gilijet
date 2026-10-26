import { Prisma } from '@prisma/client';

/**
 * Money in this codebase is Prisma Decimal(12,2) in IDR. Platform payloads
 * want a plain number in major units (IDR has no minor unit in practice), so
 * the conversion lives here and nowhere else.
 */
export function toPlatformValue(amount: Prisma.Decimal | number | string | null | undefined): number | null {
  if (amount === null || amount === undefined) return null;
  const d = new Prisma.Decimal(amount);
  if (!d.isFinite()) return null;
  return Number(d.toDecimalPlaces(2).toFixed(2));
}

/** Google Ads reporting returns cost in micros of the account currency. */
export function fromMicros(micros: string | number | bigint | null | undefined): Prisma.Decimal | null {
  if (micros === null || micros === undefined || micros === '') return null;
  return new Prisma.Decimal(micros.toString()).div(1_000_000).toDecimalPlaces(2);
}

export function sumDecimals(values: Array<Prisma.Decimal | null | undefined>): Prisma.Decimal {
  return values.reduce<Prisma.Decimal>((acc, v) => (v ? acc.add(v) : acc), new Prisma.Decimal(0));
}
