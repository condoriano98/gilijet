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

/**
 * A rate older than this is refused — stale FX charges the wrong amount.
 *
 * 72h, not 24h: refresh-fx runs daily on Vercel Hobby, so a 24h limit leaves
 * zero margin and one missed cron run would silently stop PayPal being offered
 * — precisely when a customer whose card DOKU declined needs it. Three days
 * tolerates two consecutive failures and still refuses a genuinely stale rate.
 */
export const MAX_RATE_AGE_MS = 72 * 60 * 60 * 1000;

/**
 * Currencies fetched in one call. IDR is the base, so these are the rates it
 * converts *into*.
 */
const PROVIDER_CURRENCIES = [...SUPPORTED_CURRENCIES];

/** Give up on the provider quickly — checkout must not wait on a third party. */
const PROVIDER_TIMEOUT_MS = 3_000;

/**
 * Fetch today's rates and store them.
 *
 * Lives here rather than in the cron route because the request path needs it
 * too: an FxRate table that has never been populated would otherwise withhold
 * PayPal until the next nightly run.
 *
 * Returns how many rows were written. Throws only if the provider itself is
 * unreachable or malformed — individual currencies that fail are skipped.
 */
export async function refreshRatesFromProvider(): Promise<number> {
  const res = await fetch(
    `https://api.exchangerate.host/latest?base=IDR&symbols=${PROVIDER_CURRENCIES.join(",")}`,
    { signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS) },
  );
  if (!res.ok) throw new Error(`FX provider returned ${res.status}`);

  const data = (await res.json()) as { rates?: Record<string, number> };
  if (!data.rates) throw new Error("FX provider returned no rates");

  let stored = 0;
  const fetchedAt = new Date();
  for (const [currency, rate] of Object.entries(data.rates)) {
    // The provider gives IDR->currency; we store currency->IDR, which is what
    // quoteForeignCharge divides by.
    if (typeof rate !== "number" || rate <= 0) continue;
    try {
      await prisma.fxRate.create({
        data: { currency, rate: 1 / rate, fetchedAt },
      });
      stored++;
    } catch (err) {
      console.error(`[fx] could not store ${currency}:`, err);
    }
  }
  return stored;
}

/**
 * When the inline refresh last failed. A provider outage would otherwise add
 * the full timeout to every pay-page render, so back off briefly.
 */
let lastInlineFailureAt = 0;
const INLINE_RETRY_COOLDOWN_MS = 60_000;

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
  const readLatest = () =>
    prisma.fxRate.findFirst({
      where: { currency },
      orderBy: { fetchedAt: "desc" },
    });

  let row = await readLatest();
  const isFresh = (r: typeof row) =>
    r !== null && now.getTime() - r.fetchedAt.getTime() <= MAX_RATE_AGE_MS;

  // Cold path only. The refresh-fx cron normally keeps this table warm, but it
  // runs at most daily and needs CRON_SECRET, so on a fresh environment it may
  // never have run — and withholding the backup gateway because a nightly job
  // has not fired yet is the opposite of what a backup is for. A fresh row
  // short-circuits, so the ordinary request does no network I/O.
  if (!isFresh(row) && Date.now() - lastInlineFailureAt > INLINE_RETRY_COOLDOWN_MS) {
    try {
      await refreshRatesFromProvider();
      row = await readLatest();
    } catch (err) {
      lastInlineFailureAt = Date.now();
      console.warn("[fx] inline rate refresh failed:", err);
    }
  }

  if (!row) {
    throw new FxRateUnavailableError(`No FX rate stored for ${currency}`);
  }

  // Still refuse a stale rate. This widens when the gateway is *available*, not
  // when a rate is *trusted* — a guessed conversion charges the wrong amount.
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
