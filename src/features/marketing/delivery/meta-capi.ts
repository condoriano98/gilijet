import { env } from '@/shared/server/env';
import { toPlatformValue } from '@/features/marketing/money';
import { postJson, PermanentDeliveryError } from '@/features/marketing/delivery/http';
import { consentSkip, type DeliveryContext, type DeliveryDecision } from '@/features/marketing/delivery/types';

/**
 * Meta Conversions API: server `Purchase`. Its event_id is the same stored id
 * the browser Pixel reuses on the booking page, so Meta deduplicates the two
 * (same event_name + event_id within 48 h).
 *
 * Only cookie/browser identifiers are sent (fbc, fbp, IP, user agent). Hashed
 * email/phone matching is not implemented in phase one.
 */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function metaGraphVersion(): string {
  return env.META_GRAPH_API_VERSION || 'v26.0';
}

export function decideMeta(ctx: DeliveryContext): DeliveryDecision {
  if (ctx.event.eventName !== 'purchase') return { action: 'skip', reason: 'UNSUPPORTED_EVENT' };
  if (!env.META_PIXEL_ID || !env.META_CAPI_ACCESS_TOKEN) return { action: 'skip', reason: 'NOT_CONFIGURED' };
  const blocked = consentSkip(ctx, 'marketing');
  if (blocked) return blocked;
  // client_user_agent is required for website events.
  if (!ctx.attribution?.clientUserAgent) return { action: 'skip', reason: 'NO_MATCH_DATA' };
  if (ctx.now.getTime() - ctx.event.occurredAt.getTime() > MAX_AGE_MS) return { action: 'skip', reason: 'TOO_OLD' };
  return { action: 'send' };
}

export function buildMetaPayload(ctx: DeliveryContext) {
  const a = ctx.attribution!;
  const userData: Record<string, string> = { client_user_agent: a.clientUserAgent! };
  if (a.clientIpAddress) userData.client_ip_address = a.clientIpAddress;
  if (a.fbc) userData.fbc = a.fbc;
  if (a.fbp) userData.fbp = a.fbp;
  const path = (a.landingPath ?? '/').split('?')[0];
  const payload: Record<string, unknown> = {
    data: [
      {
        event_name: 'Purchase',
        event_time: Math.floor(ctx.event.occurredAt.getTime() / 1000),
        event_id: ctx.event.eventId,
        action_source: 'website',
        event_source_url: `${ctx.appBaseUrl.replace(/\/$/, '')}${path}`,
        user_data: userData,
        custom_data: {
          value: toPlatformValue(ctx.event.value) ?? 0,
          currency: ctx.event.currency ?? 'IDR',
          order_id: ctx.event.bookingId,
          content_type: 'product',
          contents: [{ id: ctx.event.routeCode ?? 'journey', quantity: Math.max(ctx.event.passengerCount ?? 1, 1) }],
        },
      },
    ],
  };
  if (!ctx.isProduction && env.META_TEST_EVENT_CODE) payload.test_event_code = env.META_TEST_EVENT_CODE;
  return payload;
}

export async function sendMeta(ctx: DeliveryContext, fetchImpl?: typeof fetch): Promise<void> {
  const url = `https://graph.facebook.com/${metaGraphVersion()}/${encodeURIComponent(env.META_PIXEL_ID!)}/events`;
  const { json } = await postJson(url, buildMetaPayload(ctx), {
    label: 'meta-capi',
    headers: { authorization: `Bearer ${env.META_CAPI_ACCESS_TOKEN}` },
    fetchImpl,
  });
  const received = (json as { events_received?: number } | null)?.events_received;
  if (received !== 1) throw new PermanentDeliveryError(`meta-capi: events_received=${String(received)}`);
}
