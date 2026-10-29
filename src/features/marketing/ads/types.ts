import { Prisma, type AdDataSource, type AdPlatform, type AdReportLevel } from '@prisma/client';

/**
 * One validated daily spend row, in the advertising account's own timezone
 * and currency. Dates are account-local calendar days (that is how both
 * platforms report); they are never rebucketed to WITA/WIB, because a daily
 * total cannot be split by hour.
 */
export type SpendRecord = {
  platform: AdPlatform;
  accountId: string;
  /** YYYY-MM-DD in accountTimezone. */
  date: string;
  accountTimezone: string;
  currency: string;
  level: AdReportLevel;
  campaignId: string;
  campaignName: string | null;
  /** '' above ad-group/ad-set level. */
  adGroupId: string;
  /** '' above ad level. */
  adId: string;
  /** e.g. "device"; '' = no breakdown. */
  breakdownDims: string;
  breakdownValue: string;
  spend: Prisma.Decimal;
  impressions: number | null;
  clicks: number | null;
  platformPurchases: Prisma.Decimal | null;
  platformPurchaseValue: Prisma.Decimal | null;
  attributionSetting: string | null;
  reportDateBasis: string | null;
};

/** Reach/frequency are per campaign per day and never summed across rows. */
export type ReachRecord = {
  platform: AdPlatform;
  accountId: string;
  date: string;
  campaignId: string;
  reach: number | null;
  frequency: Prisma.Decimal | null;
};

/**
 * What a source delivered. `complete` is true only when the source confirms it
 * returned everything for [dateFrom, dateTo] (a whole API stream, a whole
 * file). An incomplete delivery never deletes anything.
 */
export type SpendDelivery = {
  platform: AdPlatform;
  source: AdDataSource;
  /** null for CSV: the file names its own accounts. */
  accountId: string | null;
  dateFrom: string;
  dateTo: string;
  complete: boolean;
  records: SpendRecord[];
  reach: ReachRecord[];
  /** Fields the source could not provide (e.g. reach on Google Ads). */
  unavailableFields: string[];
  incompleteReason?: string;
};

export function scopeKey(r: { platform: string; accountId: string; date: string }): string {
  return `${r.platform}|${r.accountId}|${r.date}`;
}

export function rowKey(r: SpendRecord): string {
  return [r.platform, r.accountId, r.date, r.level, r.campaignId, r.adGroupId, r.adId, r.breakdownValue].join('|');
}

export const YMD = /^\d{4}-\d{2}-\d{2}$/;

export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  const d = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (d <= end && out.length < 400) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}
