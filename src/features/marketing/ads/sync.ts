import { env } from '@/shared/server/env';
import { adsSyncEnabled, googleAdsOAuthConfigured, metaAdsReportingConfigured } from '@/features/marketing/config';
import { fetchGoogleAdsSpend } from '@/features/marketing/ads/google-ads-reporting';
import { fetchMetaSpend } from '@/features/marketing/ads/meta-reporting';
import { runSpendIngestion, type IngestReport } from '@/features/marketing/ads/ingest';

/**
 * Pull daily spend for the rolling backfill window (ADS_BACKFILL_DAYS up to
 * yesterday, UTC calendar; each platform interprets the dates in its account
 * timezone). Re-reading recent days is what absorbs late platform revisions.
 * Off unless ADS_SYNC_ENABLED=true and the platform's credentials are set.
 */
export type PlatformSyncResult =
  | { platform: 'GOOGLE_ADS' | 'META_ADS'; skipped: 'DISABLED' | 'NOT_CONFIGURED' }
  | { platform: 'GOOGLE_ADS' | 'META_ADS'; runId: string; report: IngestReport };

export function backfillRange(now = new Date(), days = env.ADS_BACKFILL_DAYS): { from: string; to: string } {
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - (days - 1));
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

export async function syncAdSpend(opts: { triggeredBy: string; from?: string; to?: string; fetchImpl?: typeof fetch }): Promise<PlatformSyncResult[]> {
  const range = opts.from && opts.to ? { from: opts.from, to: opts.to } : backfillRange();
  if (!adsSyncEnabled()) {
    return [
      { platform: 'GOOGLE_ADS', skipped: 'DISABLED' },
      { platform: 'META_ADS', skipped: 'DISABLED' },
    ];
  }
  const results: PlatformSyncResult[] = [];
  if (googleAdsOAuthConfigured()) {
    const delivery = await fetchGoogleAdsSpend({ ...range, fetchImpl: opts.fetchImpl });
    results.push({ platform: 'GOOGLE_ADS', ...(await runSpendIngestion(delivery, { triggeredBy: opts.triggeredBy })) });
  } else results.push({ platform: 'GOOGLE_ADS', skipped: 'NOT_CONFIGURED' });
  if (metaAdsReportingConfigured()) {
    const delivery = await fetchMetaSpend({ ...range, fetchImpl: opts.fetchImpl });
    results.push({ platform: 'META_ADS', ...(await runSpendIngestion(delivery, { triggeredBy: opts.triggeredBy })) });
  } else results.push({ platform: 'META_ADS', skipped: 'NOT_CONFIGURED' });
  return results;
}
