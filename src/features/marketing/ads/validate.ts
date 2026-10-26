import { rowKey, scopeKey, YMD, type SpendRecord } from '@/features/marketing/ads/types';

/**
 * Batch validation, per account-day scope. A scope (platform, account, date)
 * is written whole or not at all, so these rules make the stored data safe to
 * sum:
 * - one reporting level per scope: campaign totals never sit beside the ad
 *   rows that make them up;
 * - one breakdown dimension set per scope: a device split never sits beside
 *   an unsplit total;
 * - one currency and one timezone per account in the batch;
 * - no duplicate rows, no negative or non-finite numbers, valid dates.
 */
export type ScopeRejection = { scope: string; reasons: string[] };

export type ValidationResult = {
  validScopes: Map<string, SpendRecord[]>;
  rejected: ScopeRejection[];
};

export function validateSpendBatch(records: SpendRecord[]): ValidationResult {
  const byScope = new Map<string, SpendRecord[]>();
  for (const r of records) {
    const k = scopeKey(r);
    const list = byScope.get(k) ?? [];
    list.push(r);
    byScope.set(k, list);
  }

  // Account-wide checks: currency and timezone must be single-valued.
  const accountCurrencies = new Map<string, Set<string>>();
  const accountTimezones = new Map<string, Set<string>>();
  for (const r of records) {
    const a = `${r.platform}|${r.accountId}`;
    (accountCurrencies.get(a) ?? accountCurrencies.set(a, new Set()).get(a)!).add(r.currency);
    (accountTimezones.get(a) ?? accountTimezones.set(a, new Set()).get(a)!).add(r.accountTimezone);
  }

  const validScopes = new Map<string, SpendRecord[]>();
  const rejected: ScopeRejection[] = [];
  for (const [scope, rows] of byScope) {
    const reasons = new Set<string>();
    const account = `${rows[0].platform}|${rows[0].accountId}`;
    if ((accountCurrencies.get(account)?.size ?? 0) > 1) reasons.add('MIXED_CURRENCIES_FOR_ACCOUNT');
    if ((accountTimezones.get(account)?.size ?? 0) > 1) reasons.add('MIXED_TIMEZONES_FOR_ACCOUNT');
    if (new Set(rows.map((r) => r.level)).size > 1) reasons.add('MIXED_REPORTING_LEVELS');
    if (new Set(rows.map((r) => r.breakdownDims)).size > 1) reasons.add('MIXED_BREAKDOWNS');
    const keys = new Set<string>();
    for (const r of rows) {
      if (!YMD.test(r.date) || Number.isNaN(Date.parse(`${r.date}T00:00:00Z`))) reasons.add('INVALID_DATE');
      if (!/^[A-Z]{3}$/.test(r.currency)) reasons.add('INVALID_CURRENCY');
      if (!r.accountId || !r.campaignId) reasons.add('MISSING_ID');
      if (r.level === 'AD_GROUP' && !r.adGroupId) reasons.add('AD_GROUP_LEVEL_WITHOUT_AD_GROUP_ID');
      if (r.level === 'AD' && !r.adId) reasons.add('AD_LEVEL_WITHOUT_AD_ID');
      if (r.level === 'CAMPAIGN' && (r.adGroupId || r.adId)) reasons.add('CAMPAIGN_LEVEL_WITH_CHILD_IDS');
      if (!r.spend.isFinite() || r.spend.isNegative()) reasons.add('INVALID_SPEND');
      for (const n of [r.impressions, r.clicks]) if (n !== null && (!Number.isInteger(n) || n < 0)) reasons.add('INVALID_COUNT');
      for (const d of [r.platformPurchases, r.platformPurchaseValue]) if (d !== null && (!d.isFinite() || d.isNegative())) reasons.add('INVALID_PLATFORM_CONVERSIONS');
      const k = rowKey(r);
      if (keys.has(k)) reasons.add('DUPLICATE_ROW');
      keys.add(k);
    }
    if (reasons.size > 0) rejected.push({ scope, reasons: [...reasons] });
    else validScopes.set(scope, rows);
  }
  return { validScopes, rejected };
}
