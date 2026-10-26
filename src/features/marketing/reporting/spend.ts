import { Prisma, type AdPlatform, type AdReportLevel } from '@prisma/client';
import { eachDay } from '@/features/marketing/ads/types';
import type { SpendInput } from '@/features/marketing/reporting/metrics';

/**
 * Spend as stored by ingestion, summarised without ever inventing a zero.
 *
 * Totals are per currency: an account billed in USD is never added to one
 * billed in IDR. Coverage is per account-day: a day with no stored rows and
 * no sync confirming it was empty is a gap, and any figure over a range with
 * gaps is partial. Ingestion stores one level per account-day, so summing
 * every row of a day (campaign rows, or the ad rows of an ad-level day)
 * gives that day's spend exactly once.
 */
export type StoredSpendRow = {
  platform: AdPlatform;
  accountId: string;
  /** account-local YYYY-MM-DD */
  date: string;
  accountTimezone: string;
  currency: string;
  level: AdReportLevel;
  campaignId: string;
  campaignName: string | null;
  spend: Prisma.Decimal;
  impressions: number | null;
  clicks: number | null;
  platformPurchases: Prisma.Decimal | null;
  platformPurchaseValue: Prisma.Decimal | null;
};

export type SpendSummary = {
  from: string;
  to: string;
  byCurrency: Record<string, Prisma.Decimal>;
  accounts: Array<{ platform: AdPlatform; accountId: string; currency: string; timezone: string }>;
  /** account-days with neither rows nor a confirmed-empty sync. */
  missingAccountDays: string[];
  status: 'complete' | 'partial' | 'unavailable';
  impressions: number | null;
  clicks: number | null;
  /** As the platforms report them; never added to internal purchases. */
  platformReportedPurchases: Prisma.Decimal | null;
};

export function summarizeSpend(args: {
  rows: StoredSpendRow[];
  from: string;
  to: string;
  /** Accounts expected to report (configured or seen in sync runs). */
  expectedAccounts: Array<{ platform: AdPlatform; accountId: string }>;
  /** account-days a complete sync confirmed as empty: "PLATFORM|account|date". */
  confirmedEmpty: Set<string>;
}): SpendSummary {
  const byCurrency: Record<string, Prisma.Decimal> = {};
  const covered = new Set<string>();
  const accounts = new Map<string, { platform: AdPlatform; accountId: string; currency: string; timezone: string }>();
  let impressions: number | null = null;
  let clicks: number | null = null;
  let purchases: Prisma.Decimal | null = null;
  for (const r of args.rows) {
    if (r.date < args.from || r.date > args.to) continue;
    byCurrency[r.currency] = (byCurrency[r.currency] ?? new Prisma.Decimal(0)).add(r.spend);
    covered.add(`${r.platform}|${r.accountId}|${r.date}`);
    accounts.set(`${r.platform}|${r.accountId}`, { platform: r.platform, accountId: r.accountId, currency: r.currency, timezone: r.accountTimezone });
    if (r.impressions !== null) impressions = (impressions ?? 0) + r.impressions;
    if (r.clicks !== null) clicks = (clicks ?? 0) + r.clicks;
    if (r.platformPurchases !== null) purchases = (purchases ?? new Prisma.Decimal(0)).add(r.platformPurchases);
  }
  const expected = new Map<string, { platform: AdPlatform; accountId: string }>();
  for (const a of [...args.expectedAccounts, ...accounts.values()]) expected.set(`${a.platform}|${a.accountId}`, a);
  const missing: string[] = [];
  for (const a of expected.values()) {
    for (const day of eachDay(args.from, args.to)) {
      const k = `${a.platform}|${a.accountId}|${day}`;
      if (!covered.has(k) && !args.confirmedEmpty.has(k)) missing.push(k);
    }
  }
  const status = expected.size === 0 ? 'unavailable' : missing.length === 0 ? 'complete' : covered.size === 0 ? 'unavailable' : 'partial';
  return {
    from: args.from,
    to: args.to,
    byCurrency,
    accounts: [...accounts.values()],
    missingAccountDays: missing,
    status,
    impressions,
    clicks,
    platformReportedPurchases: purchases,
  };
}

/** The spend input for one currency, ready for metrics.ts. */
export function spendInputFor(summary: SpendSummary, currency: string): SpendInput {
  const others = Object.keys(summary.byCurrency).filter((c) => c !== currency);
  const reasons = [
    ...(summary.missingAccountDays.length ? [`${summary.missingAccountDays.length}_ACCOUNT_DAYS_WITHOUT_SPEND_DATA`] : []),
    ...(others.length ? [`SPEND_IN_OTHER_CURRENCIES_EXCLUDED_${others.join('_')}`] : []),
  ];
  if (summary.status === 'unavailable') return { status: 'unavailable', amount: new Prisma.Decimal(0), currency, reasons: ['NO_SPEND_DATA', ...reasons] };
  const amount = summary.byCurrency[currency] ?? new Prisma.Decimal(0);
  const status = summary.status === 'complete' && others.length === 0 ? 'complete' : 'partial';
  return { status, amount, currency, reasons };
}

/** Campaign spend per currency (ad rows of an ad-level day roll up to their campaign). */
export function spendByCampaign(rows: StoredSpendRow[]): Array<{ platform: AdPlatform; accountId: string; campaignId: string; campaignName: string | null; currency: string; spend: Prisma.Decimal }> {
  const m = new Map<string, { platform: AdPlatform; accountId: string; campaignId: string; campaignName: string | null; currency: string; spend: Prisma.Decimal }>();
  for (const r of rows) {
    const k = `${r.platform}|${r.accountId}|${r.campaignId}|${r.currency}`;
    const cur = m.get(k) ?? { platform: r.platform, accountId: r.accountId, campaignId: r.campaignId, campaignName: r.campaignName, currency: r.currency, spend: new Prisma.Decimal(0) };
    cur.spend = cur.spend.add(r.spend);
    if (r.campaignName) cur.campaignName = r.campaignName;
    m.set(k, cur);
  }
  return [...m.values()];
}

/**
 * Reach is unique people per campaign per day. It is returned row by row and
 * there is deliberately no total: summing reach across days or campaigns
 * counts the same people again.
 */
export type ReachRow = { platform: AdPlatform; accountId: string; date: string; campaignId: string; reach: number | null; frequency: Prisma.Decimal | null };
export function reachRows(rows: ReachRow[]): { additive: false; rows: ReachRow[] } {
  return { additive: false, rows };
}
