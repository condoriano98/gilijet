import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  enabled: false,
  google: false,
  meta: false,
  run: vi.fn(async () => ({ runId: 'r1', report: { status: 'SUCCEEDED', rowsWritten: 3 } })),
  fetchGoogle: vi.fn(async () => ({ complete: true })),
  fetchMeta: vi.fn(async () => ({ complete: true })),
}));

vi.mock('@/shared/server/env', () => ({ env: { CRON_SECRET: 'cron-secret', ADS_BACKFILL_DAYS: 7 } }));
vi.mock('@/shared/server/db', () => ({ prisma: {} }));
vi.mock('@/features/marketing/config', () => ({
  adsSyncEnabled: () => mocks.enabled,
  googleAdsOAuthConfigured: () => mocks.google,
  metaAdsReportingConfigured: () => mocks.meta,
}));
vi.mock('@/features/marketing/ads/ingest', () => ({ runSpendIngestion: mocks.run }));
vi.mock('@/features/marketing/ads/google-ads-reporting', () => ({ fetchGoogleAdsSpend: mocks.fetchGoogle }));
vi.mock('@/features/marketing/ads/meta-reporting', () => ({ fetchMetaSpend: mocks.fetchMeta }));

import { backfillRange, syncAdSpend } from '@/features/marketing/ads/sync';
import { GET as cron } from '@/app/api/cron/ads-sync/route';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.enabled = false;
  mocks.google = false;
  mocks.meta = false;
});

describe('ad spend sync', () => {
  it('re-reads a rolling window ending yesterday', () => {
    expect(backfillRange(new Date('2026-10-26T05:00:00Z'), 7)).toEqual({ from: '2026-10-19', to: '2026-10-25' });
  });

  it('makes no provider call while switched off or unconfigured', async () => {
    expect(await syncAdSpend({ triggeredBy: 't' })).toEqual([
      { platform: 'GOOGLE_ADS', skipped: 'DISABLED' },
      { platform: 'META_ADS', skipped: 'DISABLED' },
    ]);
    mocks.enabled = true;
    expect(await syncAdSpend({ triggeredBy: 't' })).toEqual([
      { platform: 'GOOGLE_ADS', skipped: 'NOT_CONFIGURED' },
      { platform: 'META_ADS', skipped: 'NOT_CONFIGURED' },
    ]);
    expect(mocks.fetchGoogle).not.toHaveBeenCalled();
    expect(mocks.fetchMeta).not.toHaveBeenCalled();
  });

  it('syncs each configured platform through ingestion', async () => {
    mocks.enabled = true;
    mocks.meta = true;
    const out = await syncAdSpend({ triggeredBy: 't', from: '2026-10-01', to: '2026-10-02' });
    expect(mocks.fetchMeta).toHaveBeenCalledWith(expect.objectContaining({ from: '2026-10-01', to: '2026-10-02' }));
    expect(out[1]).toMatchObject({ platform: 'META_ADS', runId: 'r1' });
  });

  it('the cron requires the secret', async () => {
    expect((await cron(new NextRequest('http://localhost/api/cron/ads-sync'))).status).toBe(401);
    const ok = await cron(new NextRequest('http://localhost/api/cron/ads-sync', { headers: { authorization: 'Bearer cron-secret' } }));
    expect(ok.status).toBe(200);
  });
});
