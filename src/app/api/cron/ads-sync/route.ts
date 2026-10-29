import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/shared/server/env';
import { syncAdSpend } from '@/features/marketing/ads/sync';

/**
 * Cron job: daily read-only spend sync from Google Ads and Meta for the
 * rolling backfill window. Production only (vercel.json); on staging call it
 * by hand with the CRON_SECRET bearer. Off unless ADS_SYNC_ENABLED=true.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!env.CRON_SECRET || authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  const results = await syncAdSpend({ triggeredBy: 'cron' });
  return NextResponse.json({
    ok: true,
    results: results.map((r) => ('skipped' in r ? r : { platform: r.platform, runId: r.runId, status: r.report.status, rowsWritten: r.report.rowsWritten })),
  });
}
