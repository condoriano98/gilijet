import { collectEventSchema, type CollectEvent } from '@/features/marketing/contract';
import { parseConsent, snapshotConsent, CONSENT_COOKIE } from '@/features/marketing/consent';
import { containsPii, sanitizePath } from '@/features/marketing/privacy';
import { eventsEnabled } from '@/features/marketing/config';
import { recordMarketingEvent } from '@/features/marketing/events';
import { VISITOR_COOKIE } from '@/features/marketing/booking-attribution';
import { prisma } from '@/shared/server/db';

export const MAX_COLLECT_BODY_BYTES = 2048;
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 60;

/**
 * Per-instance, per-IP limit. Serverless instances do not share it, so this
 * only blunts a single noisy client; the events are funnel counts, not money.
 */
const hits = new Map<string, { count: number; resetAt: number }>();

export function allowCollect(ip: string, now = Date.now()): boolean {
  const slot = hits.get(ip);
  if (!slot || slot.resetAt < now) {
    if (hits.size > 5000) hits.clear();
    hits.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  slot.count++;
  return slot.count <= MAX_PER_WINDOW;
}

export type CollectOutcome =
  | { status: 202; recorded: boolean }
  | { status: 204 }
  | { status: 400 | 413 | 429; error: string };

/**
 * Record a browser funnel event (search, view_item). Only with analytics
 * consent; the stored row carries no personal data, only the sanitized path,
 * route, departure date and party size.
 */
export async function handleCollect(args: {
  rawBody: string;
  ip: string;
  cookie: (name: string) => string | undefined;
}): Promise<CollectOutcome> {
  if (!eventsEnabled()) return { status: 204 };
  if (args.rawBody.length > MAX_COLLECT_BODY_BYTES) return { status: 413, error: 'Payload too large' };
  if (!allowCollect(args.ip)) return { status: 429, error: 'Too many events' };
  const consent = parseConsent(args.cookie(CONSENT_COOKIE));
  if (!consent.analytics) return { status: 204 };

  let parsed: CollectEvent;
  try {
    const result = collectEventSchema.safeParse(JSON.parse(args.rawBody));
    if (!result.success) return { status: 400, error: 'Invalid event' };
    parsed = result.data;
  } catch {
    return { status: 400, error: 'Invalid JSON' };
  }
  if (containsPii(parsed)) return { status: 400, error: 'Invalid event' };

  const visitorId = args.cookie(VISITOR_COOKIE);
  const recorded = await prisma.$transaction((tx) =>
    recordMarketingEvent(tx, {
      eventName: parsed.event_name,
      eventId: `${parsed.event_name}_${parsed.event_id}`,
      source: 'BROWSER',
      routeCode: parsed.route ?? null,
      legId: parsed.leg_id ?? null,
      departureDate: parsed.departure_date ? new Date(`${parsed.departure_date}T00:00:00Z`) : null,
      passengerCount: parsed.passenger_count ?? null,
      visitorId: visitorId && /^v_[a-f0-9]{8,32}$/.test(visitorId) ? visitorId : null,
      consent: snapshotConsent(consent),
      properties: {
        page_path: parsed.page_path ? sanitizePath(parsed.page_path) : null,
        trip_type: parsed.trip_type ?? null,
      },
    }),
  );
  return { status: 202, recorded: recorded !== null };
}
