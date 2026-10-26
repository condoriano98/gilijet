import type { MarketingDestination, MarketingEventDelivery } from '@prisma/client';
import { prisma } from '@/shared/server/db';
import { env } from '@/shared/server/env';
import { deliveryEnabled, isProductionEnvironment, marketingEnvironment } from '@/features/marketing/config';
import { scrubError } from '@/features/marketing/privacy';
import { PermanentDeliveryError } from '@/features/marketing/delivery/http';
import { decideGa4, sendGa4 } from '@/features/marketing/delivery/ga4';
import { decideMeta, sendMeta } from '@/features/marketing/delivery/meta-capi';
import { decideGoogleAds, sendGoogleAds } from '@/features/marketing/delivery/google-ads';
import type { DeliveryContext, DeliveryDecision } from '@/features/marketing/delivery/types';
import { readConsentSnapshot } from '@/features/marketing/consent';
import { effectiveConsent } from '@/features/marketing/consent-withdrawal';

/**
 * Outbox worker: sends PENDING MarketingEventDelivery rows to their provider.
 *
 * Runs from /api/cron/marketing-deliver and right after a purchase is recorded
 * (afterResponse), never inside a payment transaction, so a provider outage
 * can only delay a delivery, never a booking. Each row is claimed with a
 * conditional update, so overlapping runs cannot send it twice; the stable
 * event id makes a resend after a lost response harmless on the platform side.
 */
export const MAX_ATTEMPTS = 6;
const STUCK_PROCESSING_MS = 10 * 60 * 1000;

const ADAPTERS: Record<
  MarketingDestination,
  { decide: (ctx: DeliveryContext) => DeliveryDecision; send: (ctx: DeliveryContext, f?: typeof fetch) => Promise<void> }
> = {
  GA4: { decide: decideGa4, send: sendGa4 },
  META_CAPI: { decide: decideMeta, send: sendMeta },
  GOOGLE_ADS: { decide: decideGoogleAds, send: sendGoogleAds },
};

/** 2, 4, 8, 16, 32 minutes, then give up. */
export function nextAttemptDelayMs(attempts: number): number {
  return 2 ** Math.max(attempts, 1) * 60 * 1000;
}

export type DeliveryRunSummary = { claimed: number; delivered: number; skipped: number; failed: number; retrying: number };

export async function processDueDeliveries(opts: { limit?: number; fetchImpl?: typeof fetch; now?: Date } = {}): Promise<DeliveryRunSummary> {
  const summary: DeliveryRunSummary = { claimed: 0, delivered: 0, skipped: 0, failed: 0, retrying: 0 };
  if (!deliveryEnabled()) return summary;
  const now = opts.now ?? new Date();
  const due = await prisma.marketingEventDelivery.findMany({
    where: {
      OR: [
        { status: 'PENDING', nextAttemptAt: { lte: now } },
        { status: 'PROCESSING', lastAttemptAt: { lt: new Date(now.getTime() - STUCK_PROCESSING_MS) } },
      ],
    },
    orderBy: { nextAttemptAt: 'asc' },
    take: opts.limit ?? 50,
    select: { id: true, status: true, lastAttemptAt: true },
  });
  for (const row of due) {
    const outcome = await deliverOne(row, { fetchImpl: opts.fetchImpl, now });
    if (outcome === 'not_claimed') continue;
    summary.claimed++;
    summary[outcome]++;
  }
  return summary;
}

type Outcome = 'delivered' | 'skipped' | 'failed' | 'retrying' | 'not_claimed';

async function deliverOne(
  seen: Pick<MarketingEventDelivery, 'id' | 'status' | 'lastAttemptAt'>,
  opts: { fetchImpl?: typeof fetch; now: Date },
): Promise<Outcome> {
  const id = seen.id;
  // Compare-and-set on status and lastAttemptAt: two workers that both saw a
  // stuck PROCESSING row cannot both reclaim it, because the first claim
  // moves lastAttemptAt.
  const claimed = await prisma.marketingEventDelivery.updateMany({
    where: { id, status: seen.status, lastAttemptAt: seen.lastAttemptAt },
    data: { status: 'PROCESSING', attempts: { increment: 1 }, lastAttemptAt: opts.now },
  });
  if (claimed.count === 0) return 'not_claimed';

  const row = await prisma.marketingEventDelivery.findUnique({
    where: { id },
    include: { event: true },
  });
  if (!row) return 'not_claimed';

  // Events recorded in another environment (a staging row in a copied
  // database, say) are never sent from this one.
  if (row.event.environment !== marketingEnvironment()) {
    await settle(id, { status: 'SKIPPED', skipReason: 'OTHER_ENVIRONMENT' });
    return 'skipped';
  }

  const attribution = row.event.bookingId
    ? await prisma.bookingAttribution.findUnique({ where: { bookingId: row.event.bookingId } })
    : null;
  const ctx: DeliveryContext = {
    event: row.event,
    attribution,
    consent: effectiveConsent(readConsentSnapshot(row.event.consent), attribution),
    now: opts.now,
    isProduction: isProductionEnvironment(),
    appBaseUrl: env.APP_BASE_URL,
  };
  const adapter = ADAPTERS[row.destination];
  const decision = adapter.decide(ctx);
  if (decision.action === 'skip') {
    await settle(id, { status: 'SKIPPED', skipReason: decision.reason });
    return 'skipped';
  }

  try {
    await adapter.send(ctx, opts.fetchImpl);
    await settle(id, { status: 'DELIVERED', deliveredAt: new Date(), lastError: null });
    return 'delivered';
  } catch (err) {
    const message = scrubError(err);
    const permanent = err instanceof PermanentDeliveryError;
    if (permanent || row.attempts >= MAX_ATTEMPTS) {
      await settle(id, { status: 'FAILED', lastError: message });
      return 'failed';
    }
    await settle(id, {
      status: 'PENDING',
      lastError: message,
      nextAttemptAt: new Date(opts.now.getTime() + nextAttemptDelayMs(row.attempts)),
    });
    return 'retrying';
  }
}

async function settle(
  id: string,
  data: Partial<Pick<MarketingEventDelivery, 'status' | 'skipReason' | 'lastError' | 'deliveredAt' | 'nextAttemptAt'>>,
) {
  await prisma.marketingEventDelivery.update({ where: { id }, data });
}

/**
 * Admin replay: put a FAILED or SKIPPED delivery back in the queue with a
 * fresh attempt budget. The event id is unchanged, so a platform that already
 * received it deduplicates the resend. Delivered rows are never replayed.
 */
export async function replayDelivery(id: string): Promise<boolean> {
  const res = await prisma.marketingEventDelivery.updateMany({
    where: { id, status: { in: ['FAILED', 'SKIPPED'] } },
    data: { status: 'PENDING', attempts: 0, nextAttemptAt: new Date(), skipReason: null, lastError: null },
  });
  return res.count === 1;
}

/**
 * Wipe matching identifiers (click ids, Meta cookies, GA ids, IP, user agent)
 * from attribution snapshots older than the retention window. Channel, UTM
 * and campaign ids stay: they are what the dashboard reports on.
 */
export async function purgeExpiredMatchData(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - env.MARKETING_MATCH_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const res = await prisma.bookingAttribution.updateMany({
    where: {
      createdAt: { lt: cutoff },
      OR: [
        { gclid: { not: null } },
        { gbraid: { not: null } },
        { wbraid: { not: null } },
        { fbc: { not: null } },
        { fbp: { not: null } },
        { gaClientId: { not: null } },
        { clientIpAddress: { not: null } },
        { clientUserAgent: { not: null } },
      ],
    },
    data: {
      gclid: null,
      gbraid: null,
      wbraid: null,
      fbc: null,
      fbp: null,
      gaClientId: null,
      gaSessionId: null,
      clientIpAddress: null,
      clientUserAgent: null,
    },
  });
  return res.count;
}

/** Fire-and-forget kick after a purchase: send now rather than at the next cron. */
export async function kickDeliveries(): Promise<void> {
  if (!deliveryEnabled()) return;
  try {
    await processDueDeliveries({ limit: 10 });
  } catch (err) {
    console.error('[marketing] delivery kick failed:', scrubError(err));
  }
}

export { PermanentDeliveryError };
