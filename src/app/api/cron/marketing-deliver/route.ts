import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/shared/server/env';
import { processDueDeliveries, purgeExpiredMatchData } from '@/features/marketing/delivery/dispatcher';
import { deliveryEnabled, eventsEnabled } from '@/features/marketing/config';

/**
 * Cron job: sends queued marketing events (GA4, Google Ads, Meta CAPI) and
 * wipes matching identifiers older than MARKETING_MATCH_RETENTION_DAYS.
 * Every 5 minutes on Production (vercel.json); on staging call it by hand with
 * the CRON_SECRET bearer. Off unless MARKETING_DELIVERY_ENABLED=true.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!env.CRON_SECRET || authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  // Retention applies whenever events are being recorded, even with delivery off.
  const purged = eventsEnabled() ? await purgeExpiredMatchData() : 0;
  if (!deliveryEnabled()) {
    return NextResponse.json({ ok: true, disabled: true, purged });
  }
  const summary = await processDueDeliveries({ limit: 100 });
  return NextResponse.json({ ok: true, purged, ...summary });
}
