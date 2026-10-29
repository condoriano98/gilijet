import { env } from '@/shared/server/env';
import { toPlatformValue } from '@/features/marketing/money';
import { postJson, PermanentDeliveryError } from '@/features/marketing/delivery/http';
import { consentSkip, type DeliveryContext, type DeliveryDecision } from '@/features/marketing/delivery/types';

/**
 * GA4 Measurement Protocol: server copies of `purchase` and `refund`.
 *
 * GA4 is the observation source for Google, not the bidding source (that is
 * the Data Manager upload in google-ads.ts). The browser never sends a GA4
 * purchase, so there is exactly one GA4 purchase per booking.
 *
 * transaction_id is the internal booking id: stable per booking, and unlike
 * the booking reference it opens nothing if it leaks.
 */
const MAX_AGE_MS = 72 * 60 * 60 * 1000;

export function decideGa4(ctx: DeliveryContext): DeliveryDecision {
  if (ctx.event.eventName !== 'purchase' && ctx.event.eventName !== 'refund') {
    return { action: 'skip', reason: 'UNSUPPORTED_EVENT' };
  }
  if (!env.GA4_MEASUREMENT_ID || !env.GA4_API_SECRET) return { action: 'skip', reason: 'NOT_CONFIGURED' };
  const blocked = consentSkip(ctx, 'analytics');
  if (blocked) return blocked;
  if (!ctx.attribution?.gaClientId) return { action: 'skip', reason: 'NO_MATCH_DATA' };
  if (ctx.now.getTime() - ctx.event.occurredAt.getTime() > MAX_AGE_MS) return { action: 'skip', reason: 'TOO_OLD' };
  return { action: 'send' };
}

export function buildGa4Payload(ctx: DeliveryContext) {
  const consent = ctx.consent;
  const value = toPlatformValue(ctx.event.value) ?? 0;
  const qty = Math.max(ctx.event.passengerCount ?? 1, 1);
  const params: Record<string, unknown> = {
    transaction_id: ctx.event.bookingId,
    value,
    currency: ctx.event.currency ?? 'IDR',
    engagement_time_msec: 1,
  };
  if (ctx.attribution?.gaSessionId) params.session_id = ctx.attribution.gaSessionId;
  if (ctx.event.eventName === 'purchase') {
    params.items = [
      {
        item_id: ctx.event.routeCode ?? 'journey',
        item_name: ctx.event.routeCode ?? 'journey',
        quantity: qty,
        price: Math.round((value / qty) * 100) / 100,
      },
    ];
  }
  return {
    client_id: ctx.attribution!.gaClientId,
    timestamp_micros: ctx.event.occurredAt.getTime() * 1000,
    consent: {
      ad_user_data: consent.marketing ? 'GRANTED' : 'DENIED',
      ad_personalization: consent.marketing ? 'GRANTED' : 'DENIED',
    },
    events: [{ name: ctx.event.eventName, params }],
  };
}

export async function sendGa4(ctx: DeliveryContext, fetchImpl?: typeof fetch): Promise<void> {
  const host = ctx.isProduction ? 'https://www.google-analytics.com/mp/collect' : 'https://www.google-analytics.com/debug/mp/collect';
  const url = `${host}?measurement_id=${encodeURIComponent(env.GA4_MEASUREMENT_ID!)}&api_secret=${encodeURIComponent(env.GA4_API_SECRET!)}`;
  const { json } = await postJson(url, buildGa4Payload(ctx), { label: 'ga4', fetchImpl });
  // Outside production the debug endpoint is used: it validates without
  // recording, and reports problems in the body with a 200.
  const messages = (json as { validationMessages?: Array<{ description?: string }> } | null)?.validationMessages;
  if (messages && messages.length > 0) {
    throw new PermanentDeliveryError(`ga4 validation: ${messages.map((m) => m.description).join('; ').slice(0, 300)}`);
  }
}
