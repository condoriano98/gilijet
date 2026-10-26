import { Prisma } from '@prisma/client';
import { env } from '@/shared/server/env';
import { googleAccessToken } from '@/features/marketing/google-auth';
import { fromMicros } from '@/features/marketing/money';
import { PROVIDER_TIMEOUT_MS } from '@/features/marketing/delivery/http';
import { scrubError } from '@/features/marketing/privacy';
import { YMD, type SpendDelivery, type SpendRecord } from '@/features/marketing/ads/types';

/**
 * Read-only daily spend from the Google Ads API (v26, googleAds:searchStream,
 * OAuth bearer; developer tokens were retired on 2026-09-09).
 *
 * Campaign level on purpose: ad-level rows (ad_group_ad) do not cover
 * Performance Max and other ad-less spend, so their sum would understate
 * what the account actually spent. Costs come back in micros of the account
 * currency and are converted with Decimal arithmetic, never floats.
 *
 * metrics.conversions counts the account's primary conversion actions by
 * click date. It is stored as "platform reported" beside the internal
 * figures and never added to them.
 */
export function googleAdsApiVersion(): string {
  return env.GOOGLE_ADS_API_VERSION || 'v26';
}

export function buildCampaignSpendQuery(from: string, to: string): string {
  if (!YMD.test(from) || !YMD.test(to)) throw new Error('Invalid date range');
  return [
    'SELECT customer.id, customer.time_zone, customer.currency_code,',
    'campaign.id, campaign.name, segments.date,',
    'metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions, metrics.conversions_value',
    'FROM campaign',
    `WHERE segments.date BETWEEN '${from}' AND '${to}'`,
  ].join(' ');
}

type GoogleRow = {
  customer?: { id?: string; timeZone?: string; currencyCode?: string };
  campaign?: { id?: string; name?: string };
  segments?: { date?: string };
  metrics?: { costMicros?: string; impressions?: string; clicks?: string; conversions?: number | string; conversionsValue?: number | string };
};

export function mapGoogleRows(batches: Array<{ results?: GoogleRow[] }>): SpendRecord[] {
  const out: SpendRecord[] = [];
  for (const batch of batches) {
    for (const r of batch.results ?? []) {
      const m = r.metrics ?? {};
      out.push({
        platform: 'GOOGLE_ADS',
        accountId: String(r.customer?.id ?? ''),
        date: String(r.segments?.date ?? ''),
        accountTimezone: String(r.customer?.timeZone ?? ''),
        currency: String(r.customer?.currencyCode ?? ''),
        level: 'CAMPAIGN',
        campaignId: String(r.campaign?.id ?? ''),
        campaignName: r.campaign?.name ?? null,
        adGroupId: '',
        adId: '',
        breakdownDims: '',
        breakdownValue: '',
        spend: fromMicros(m.costMicros ?? '0') ?? new Prisma.Decimal(0),
        impressions: m.impressions !== undefined ? Number(m.impressions) : null,
        clicks: m.clicks !== undefined ? Number(m.clicks) : null,
        platformPurchases: m.conversions !== undefined ? new Prisma.Decimal(String(m.conversions)) : null,
        platformPurchaseValue: m.conversionsValue !== undefined ? new Prisma.Decimal(String(m.conversionsValue)) : null,
        attributionSetting: 'primary_conversion_actions',
        reportDateBasis: 'click',
      });
    }
  }
  return out;
}

export async function fetchGoogleAdsSpend(args: { from: string; to: string; fetchImpl?: typeof fetch }): Promise<SpendDelivery> {
  const customer = env.GOOGLE_ADS_CUSTOMER_ID!;
  const base: SpendDelivery = {
    platform: 'GOOGLE_ADS',
    source: 'API',
    accountId: customer,
    dateFrom: args.from,
    dateTo: args.to,
    complete: false,
    records: [],
    reach: [],
    unavailableFields: ['reach', 'frequency', 'ad_group_id', 'ad_id'],
  };
  const doFetch = args.fetchImpl ?? fetch;
  try {
    const token = await googleAccessToken(doFetch);
    const res = await doFetch(`https://googleads.googleapis.com/${googleAdsApiVersion()}/customers/${customer}/googleAds:searchStream`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        ...(env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ? { 'login-customer-id': env.GOOGLE_ADS_LOGIN_CUSTOMER_ID } : {}),
      },
      body: JSON.stringify({ query: buildCampaignSpendQuery(args.from, args.to) }),
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS * 3),
    });
    const text = await res.text();
    if (!res.ok) return { ...base, incompleteReason: `HTTP ${res.status} ${scrubError(text.slice(0, 300))}` };
    const parsed = JSON.parse(text) as unknown;
    const batches = Array.isArray(parsed) ? (parsed as Array<{ results?: GoogleRow[]; error?: unknown }>) : [];
    // A stream that ends in an error object is a partial answer.
    if (batches.some((b) => b && typeof b === 'object' && 'error' in b)) return { ...base, incompleteReason: 'STREAM_ERROR' };
    const records = mapGoogleRows(batches);
    if (records.some((r) => r.accountId !== customer)) return { ...base, incompleteReason: 'UNEXPECTED_CUSTOMER_IN_RESPONSE' };
    return { ...base, complete: true, records };
  } catch (err) {
    return { ...base, incompleteReason: scrubError(err, 300) };
  }
}
