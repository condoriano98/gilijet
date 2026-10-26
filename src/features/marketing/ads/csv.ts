import { createHash } from 'node:crypto';
import { Prisma, type AdPlatform, type AdReportLevel } from '@prisma/client';
import { YMD, type SpendDelivery, type SpendRecord } from '@/features/marketing/ads/types';

/**
 * CSV spend import: the fallback when API access is not available, and a
 * first-class source in its own right.
 *
 * Grain: one row per platform, account, date and the row's level (campaign,
 * ad group/ad set, or ad), optionally split by one breakdown. A file may mix
 * levels across days but not within one account-day (validate.ts rejects
 * that day). Replace semantics: each account-day in the file replaces the
 * stored rows for that account-day; days not in the file are untouched.
 * Re-importing an identical file rewrites the same rows and adds nothing.
 */
export const CSV_COLUMNS = [
  { name: 'platform', required: true, note: 'google_ads | meta_ads' },
  { name: 'account_id', required: true, note: 'Google customer id (digits) or Meta ad account id (digits, no act_)' },
  { name: 'date', required: true, note: 'YYYY-MM-DD in the ad account timezone' },
  { name: 'account_timezone', required: true, note: 'IANA name, e.g. Asia/Makassar' },
  { name: 'currency', required: true, note: 'ISO 4217 code of the ad account, e.g. IDR, USD' },
  { name: 'campaign_id', required: true, note: 'Platform campaign id (join key; names are mutable)' },
  { name: 'campaign_name', required: false, note: '' },
  { name: 'ad_group_or_adset_id', required: false, note: 'Blank for campaign-level rows' },
  { name: 'ad_id', required: false, note: 'Blank unless the row is ad-level' },
  { name: 'level', required: false, note: 'campaign | ad_group | ad; inferred from the ids when blank' },
  { name: 'breakdown_dims', required: false, note: 'e.g. device; blank for no breakdown' },
  { name: 'breakdown_value', required: false, note: 'e.g. mobile' },
  { name: 'spend', required: true, note: 'Decimal in the account currency, e.g. 125000.50' },
  { name: 'impressions', required: false, note: 'Integer; blank = not reported' },
  { name: 'clicks', required: false, note: 'Integer; blank = not reported' },
  { name: 'platform_reported_purchases', required: false, note: 'As reported by the platform; never added to internal purchases' },
  { name: 'platform_reported_purchase_value', required: false, note: '' },
  { name: 'attribution_setting', required: false, note: 'e.g. 7d_click_1d_view' },
  { name: 'report_date_basis', required: false, note: 'click | impression | conversion' },
] as const;

export function csvTemplate(): string {
  return `${CSV_COLUMNS.map((c) => c.name).join(',')}\n`;
}

/** RFC 4180: quoted fields, escaped quotes, CRLF or LF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((f) => f !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((f) => f !== '')) rows.push(row);
  return rows;
}

export type CsvRowError = { line: number; errors: string[] };

export type CsvParseResult = {
  deliveries: SpendDelivery[];
  rowErrors: CsvRowError[];
  headerErrors: string[];
  contentHash: string;
  rowCount: number;
};

const PLATFORMS: Record<string, AdPlatform> = { google_ads: 'GOOGLE_ADS', meta_ads: 'META_ADS' };
const LEVELS: Record<string, AdReportLevel> = { campaign: 'CAMPAIGN', ad_group: 'AD_GROUP', adset: 'AD_GROUP', ad_set: 'AD_GROUP', ad: 'AD' };
const DECIMAL = /^-?\d+(\.\d+)?$/;
const INTEGER = /^\d+$/;
export const MAX_CSV_ROWS = 50_000;

/**
 * Parse and validate a spend CSV into one delivery per platform. A file with
 * any row error is refused whole (no partial import of a hand-made file):
 * the report says which lines to fix.
 */
export function parseSpendCsv(text: string): CsvParseResult {
  const contentHash = createHash('sha256').update(text).digest('hex');
  const rows = parseCsv(text);
  const result: CsvParseResult = { deliveries: [], rowErrors: [], headerErrors: [], contentHash, rowCount: Math.max(rows.length - 1, 0) };
  if (rows.length === 0) {
    result.headerErrors.push('EMPTY_FILE');
    return result;
  }
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const known = new Set<string>(CSV_COLUMNS.map((c) => c.name));
  for (const c of CSV_COLUMNS) if (c.required && !header.includes(c.name)) result.headerErrors.push(`MISSING_COLUMN_${c.name}`);
  for (const h of header) if (!known.has(h)) result.headerErrors.push(`UNKNOWN_COLUMN_${h}`);
  if (new Set(header).size !== header.length) result.headerErrors.push('DUPLICATE_COLUMN');
  if (rows.length - 1 > MAX_CSV_ROWS) result.headerErrors.push(`TOO_MANY_ROWS_MAX_${MAX_CSV_ROWS}`);
  if (result.headerErrors.length) return result;

  const records: SpendRecord[] = [];
  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i];
    const get = (name: string) => (cells[header.indexOf(name)] ?? '').trim();
    const errors: string[] = [];
    if (cells.length !== header.length) errors.push('COLUMN_COUNT');
    const platform = PLATFORMS[get('platform').toLowerCase()];
    if (!platform) errors.push('INVALID_PLATFORM');
    const accountId = get('account_id').replace(/^act_/, '').replace(/-/g, '');
    if (!/^\d{3,20}$/.test(accountId)) errors.push('INVALID_ACCOUNT_ID');
    const date = get('date');
    if (!YMD.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) errors.push('INVALID_DATE');
    const accountTimezone = get('account_timezone');
    if (!isTimeZone(accountTimezone)) errors.push('INVALID_TIMEZONE');
    const currency = get('currency').toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) errors.push('INVALID_CURRENCY');
    const campaignId = get('campaign_id');
    if (!campaignId) errors.push('MISSING_CAMPAIGN_ID');
    const adGroupId = get('ad_group_or_adset_id');
    const adId = get('ad_id');
    const levelRaw = get('level').toLowerCase();
    const level: AdReportLevel | undefined = levelRaw ? LEVELS[levelRaw] : adId ? 'AD' : adGroupId ? 'AD_GROUP' : 'CAMPAIGN';
    if (!level) errors.push('INVALID_LEVEL');
    const spendRaw = get('spend');
    if (!DECIMAL.test(spendRaw)) errors.push('INVALID_SPEND');
    const optInt = (name: string) => {
      const v = get(name);
      if (!v) return null;
      if (!INTEGER.test(v)) {
        errors.push(`INVALID_${name.toUpperCase()}`);
        return null;
      }
      return Number(v);
    };
    const optDec = (name: string) => {
      const v = get(name);
      if (!v) return null;
      if (!DECIMAL.test(v)) {
        errors.push(`INVALID_${name.toUpperCase()}`);
        return null;
      }
      return new Prisma.Decimal(v);
    };
    const impressions = optInt('impressions');
    const clicks = optInt('clicks');
    const platformPurchases = optDec('platform_reported_purchases');
    const platformPurchaseValue = optDec('platform_reported_purchase_value');
    if (errors.length) {
      result.rowErrors.push({ line: i + 1, errors });
      continue;
    }
    records.push({
      platform: platform!,
      accountId,
      date,
      accountTimezone,
      currency,
      level: level!,
      campaignId,
      campaignName: get('campaign_name') || null,
      adGroupId: level === 'CAMPAIGN' ? '' : adGroupId,
      adId: level === 'AD' ? adId : '',
      breakdownDims: get('breakdown_dims'),
      breakdownValue: get('breakdown_value'),
      spend: new Prisma.Decimal(spendRaw),
      impressions,
      clicks,
      platformPurchases,
      platformPurchaseValue,
      attributionSetting: get('attribution_setting') || null,
      reportDateBasis: get('report_date_basis') || null,
    });
  }
  if (result.rowErrors.length) return result;

  for (const platform of new Set(records.map((r) => r.platform))) {
    const mine = records.filter((r) => r.platform === platform);
    const dates = mine.map((r) => r.date).sort();
    result.deliveries.push({
      platform,
      source: 'CSV',
      accountId: null,
      dateFrom: dates[0],
      dateTo: dates[dates.length - 1],
      complete: true,
      records: mine,
      reach: [],
      unavailableFields: ['reach', 'frequency'],
    });
  }
  return result;
}

function isTimeZone(tz: string): boolean {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
