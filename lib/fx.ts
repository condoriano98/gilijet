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
