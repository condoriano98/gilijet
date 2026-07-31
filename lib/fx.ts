import { prisma } from "./db";

export type FxSnapshot = {
  currency: string;
  rate: number;
};

const SUPPORTED_CURRENCIES = ["USD", "EUR", "AUD", "SGD", "MYR", "THB", "CNY", "JPY", "KRW"] as const;

export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

export function isSupportedCurrency(c: string): c is SupportedCurrency {
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(c);
}

export async function getLatestRates(): Promise<Map<string, number>> {
  const rates = new Map<string, number>();
  try {
    const rows = await prisma.fxRate.findMany({
      where: {
        currency: { in: [...SUPPORTED_CURRENCIES] },
      },
      orderBy: { fetchedAt: "desc" },
      take: SUPPORTED_CURRENCIES.length * 2,
    });
    const seen = new Set<string>();
    for (const row of rows) {
      if (!seen.has(row.currency)) {
        seen.add(row.currency);
        rates.set(row.currency, Number(row.rate));
      }
    }
  } catch (err) {
    console.error("[fx] getLatestRates failed:", err);
  }
  return rates;
}

export function convertIdr(idr: number, rate: number): number {
  return Math.round(idr / rate);
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$",
  EUR: "€",
  AUD: "A$",
  SGD: "S$",
  MYR: "RM",
  THB: "฿",
  CNY: "¥",
  JPY: "¥",
  KRW: "₩",
};

export function formatWithDisplay(
  idr: number,
  currency: string,
  rates: Map<string, number>,
): { primary: string; secondary: string | null } {
  const primary = "Rp " + idr.toLocaleString("id-ID", { maximumFractionDigits: 0 });
  const rate = rates.get(currency);
  if (!rate || !isSupportedCurrency(currency)) {
    return { primary, secondary: null };
  }
  const converted = convertIdr(idr, rate);
  const symbol = CURRENCY_SYMBOLS[currency] ?? "";
  const secondary = `~${symbol}${converted.toLocaleString("en-US", { maximumFractionDigits: 0 })} ${currency}`;
  return { primary, secondary };
}

// ─── Charging in a foreign currency ─────────────────────────────────────────

/**
 * Everything above this line is display-grade: `getLatestRates` swallows errors
 * into an empty Map and `convertIdr` rounds to whole units, both of which are
 * fine for an approximate price hint beside the IDR total.
 *
 * Neither is safe for taking money. A missing rate must not read as success,
 * and rounding $40.37 to $40 loses cents on every transaction. `quoteForeignCharge`
 * is the money-grade path: it refuses rather than guesses, and keeps cents.
 */

/** A rate older than this is refused — stale FX charges the wrong amount. */
export const MAX_RATE_AGE_MS = 24 * 60 * 60 * 1000;

export type ForeignChargeQuote = {
  currency: string;
  /** Presentment amount, 2dp, as a string so no float rounding survives to the gateway. */
  amount: string;
  /** IDR per 1 unit of `currency`, exactly as used for `amount`. */
  rate: number;
  quotedAt: Date;
};

export class FxRateUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FxRateUnavailableError";
  }
}

/**
 * Convert an IDR total into a chargeable foreign amount.
 *
 * Throws `FxRateUnavailableError` when no rate exists or the newest one is
 * older than `MAX_RATE_AGE_MS`. Callers treat that as "this gateway is not
 * available right now" — never as a reason to fall back to a guessed rate.
 */
export async function quoteForeignCharge(
  idr: number,
  currency: string,
  now: Date = new Date(),
): Promise<ForeignChargeQuote> {
  if (!Number.isFinite(idr) || idr <= 0) {
    throw new FxRateUnavailableError(`Cannot quote a non-positive total: ${idr}`);
  }
  if (!isSupportedCurrency(currency)) {
    throw new FxRateUnavailableError(`Unsupported currency: ${currency}`);
  }

  // Deliberately not getLatestRates() — that helper reports failure as an empty
  // Map, which is indistinguishable from "no rate for this currency".
  const row = await prisma.fxRate.findFirst({
    where: { currency },
    orderBy: { fetchedAt: "desc" },
  });
  if (!row) {
    throw new FxRateUnavailableError(`No FX rate stored for ${currency}`);
  }

  const ageMs = now.getTime() - row.fetchedAt.getTime();
  if (ageMs > MAX_RATE_AGE_MS) {
    const hours = Math.round(ageMs / 3_600_000);
    throw new FxRateUnavailableError(
      `FX rate for ${currency} is ${hours}h old (max ${MAX_RATE_AGE_MS / 3_600_000}h)`,
    );
  }

  const rate = Number(row.rate);
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new FxRateUnavailableError(`Invalid FX rate for ${currency}: ${row.rate}`);
  }

  // Round half-up at 2dp in integer space so the customer is never charged a
  // fraction of a cent, and the stored amount matches what the gateway takes.
  const cents = Math.round((idr / rate) * 100);
  if (cents <= 0) {
    throw new FxRateUnavailableError(
      `Converted amount rounds to zero: ${idr} IDR at ${rate} ${currency}`,
    );
  }

  return {
    currency,
    amount: (cents / 100).toFixed(2),
    rate,
    quotedAt: row.fetchedAt,
  };
}
