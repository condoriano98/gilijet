import { Prisma } from '@prisma/client';
import { env } from '@/shared/server/env';
import { PROVIDER_TIMEOUT_MS } from '@/features/marketing/delivery/http';
import { metaGraphVersion } from '@/features/marketing/delivery/meta-capi';
import { scrubError } from '@/features/marketing/privacy';
import type { ReachRecord, SpendDelivery, SpendRecord } from '@/features/marketing/ads/types';

/**
 * Read-only daily spend from the Meta Marketing API Insights edge (v26.0).
 *
 * Ad level, one row per ad per day: every Meta spend runs through an ad, so
 * ad rows add up to the account. Reach and frequency come from a separate
 * campaign-level request and are stored apart from spend: reach is unique
 * people, which cannot be added across ads, campaigns or days.
 *
 * Purchases are the platform's own figure (7-day click / 1-day view, reported
 * at conversion time since 2025-06-10) and are never added to internal ones.
 * Meta may revise figures for up to 28 days, which the rolling backfill
 * re-reads.
 */
const PURCHASE_ACTIONS = ['omni_purchase', 'purchase', 'offsite_conversion.fb_pixel_purchase'];
const ATTRIBUTION = ['7d_click', '1d_view'];

type MetaAction = { action_type?: string; value?: string };
type MetaInsightRow = {
  date_start?: string;
  campaign_id?: string;
  campaign_name?: string;
  adset_id?: string;
  ad_id?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  reach?: string;
  frequency?: string;
  actions?: MetaAction[];
  action_values?: MetaAction[];
};

export function pickPurchase(actions: MetaAction[] | undefined): Prisma.Decimal | null {
  if (!actions) return null;
  for (const type of PURCHASE_ACTIONS) {
    const hit = actions.find((a) => a.action_type === type);
    if (hit?.value !== undefined) return new Prisma.Decimal(hit.value);
  }
  return null;
}

export function mapMetaRows(rows: MetaInsightRow[], account: { id: string; currency: string; timezone: string }): SpendRecord[] {
  return rows.map((r) => ({
    platform: 'META_ADS',
    accountId: account.id,
    date: String(r.date_start ?? ''),
    accountTimezone: account.timezone,
    currency: account.currency,
    level: 'AD',
    campaignId: String(r.campaign_id ?? ''),
    campaignName: r.campaign_name ?? null,
    adGroupId: String(r.adset_id ?? ''),
    adId: String(r.ad_id ?? ''),
    breakdownDims: '',
    breakdownValue: '',
    spend: new Prisma.Decimal(r.spend ?? '0'),
    impressions: r.impressions !== undefined ? Number(r.impressions) : null,
    clicks: r.clicks !== undefined ? Number(r.clicks) : null,
    platformPurchases: pickPurchase(r.actions),
    platformPurchaseValue: pickPurchase(r.action_values),
    attributionSetting: ATTRIBUTION.join('_'),
    reportDateBasis: 'conversion',
  }));
}

export function mapMetaReach(rows: MetaInsightRow[], accountId: string): ReachRecord[] {
  return rows.map((r) => ({
    platform: 'META_ADS',
    accountId,
    date: String(r.date_start ?? ''),
    campaignId: String(r.campaign_id ?? ''),
    reach: r.reach !== undefined ? Number(r.reach) : null,
    frequency: r.frequency !== undefined ? new Prisma.Decimal(r.frequency) : null,
  }));
}

async function getAll(url: string, token: string, doFetch: typeof fetch): Promise<MetaInsightRow[]> {
  const rows: MetaInsightRow[] = [];
  let next: string | null = url;
  for (let page = 0; next && page < 200; page++) {
    const res: Response = await doFetch(next, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS * 3) });
    const body = (await res.json().catch(() => ({}))) as { data?: MetaInsightRow[]; paging?: { next?: string }; error?: { message?: string } };
    if (!res.ok || body.error) throw new Error(`meta insights HTTP ${res.status} ${scrubError(body.error?.message ?? '', 200)}`);
    rows.push(...(body.data ?? []));
    next = body.paging?.next ?? null;
  }
  if (next) throw new Error('meta insights: too many pages');
  return rows;
}

export async function fetchMetaSpend(args: { from: string; to: string; fetchImpl?: typeof fetch }): Promise<SpendDelivery> {
  const accountId = env.META_AD_ACCOUNT_ID!.replace(/^act_/, '');
  const token = env.META_ADS_ACCESS_TOKEN || env.META_CAPI_ACCESS_TOKEN!;
  const base: SpendDelivery = {
    platform: 'META_ADS',
    source: 'API',
    accountId,
    dateFrom: args.from,
    dateTo: args.to,
    complete: false,
    records: [],
    reach: [],
    unavailableFields: [],
  };
  const doFetch = args.fetchImpl ?? fetch;
  const graph = `https://graph.facebook.com/${metaGraphVersion()}`;
  try {
    const acctRes = await doFetch(`${graph}/act_${accountId}?fields=currency,timezone_name`, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
    const acct = (await acctRes.json().catch(() => ({}))) as { currency?: string; timezone_name?: string };
    if (!acctRes.ok || !acct.currency || !acct.timezone_name) return { ...base, incompleteReason: `ACCOUNT_LOOKUP_FAILED HTTP ${acctRes.status}` };
    const common = new URLSearchParams({
      time_increment: '1',
      time_range: JSON.stringify({ since: args.from, until: args.to }),
      limit: '500',
    });
    const spendParams = new URLSearchParams(common);
    spendParams.set('level', 'ad');
    spendParams.set('fields', 'date_start,campaign_id,campaign_name,adset_id,ad_id,spend,impressions,clicks,actions,action_values');
    spendParams.set('action_attribution_windows', JSON.stringify(ATTRIBUTION));
    const reachParams = new URLSearchParams(common);
    reachParams.set('level', 'campaign');
    reachParams.set('fields', 'date_start,campaign_id,reach,frequency');
    const [spendRows, reachRows] = await Promise.all([
      getAll(`${graph}/act_${accountId}/insights?${spendParams}`, token, doFetch),
      getAll(`${graph}/act_${accountId}/insights?${reachParams}`, token, doFetch),
    ]);
    const account = { id: accountId, currency: acct.currency, timezone: acct.timezone_name };
    return { ...base, complete: true, records: mapMetaRows(spendRows, account), reach: mapMetaReach(reachRows, accountId) };
  } catch (err) {
    return { ...base, incompleteReason: scrubError(err, 300) };
  }
}
