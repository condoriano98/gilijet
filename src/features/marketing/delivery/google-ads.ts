import { env } from '@/shared/server/env';
import { toPlatformValue } from '@/features/marketing/money';
import { googleAccessToken } from '@/features/marketing/google-auth';
import { postJson, PermanentDeliveryError } from '@/features/marketing/delivery/http';
import { consentSkip, type DeliveryContext, type DeliveryDecision } from '@/features/marketing/delivery/types';
import { MS_PER_DAY } from '@/shared/constants/time';
import { DEFAULT_CURRENCY } from '@/shared/constants/locale';

/**
 * Google Ads purchase conversion, uploaded server-side through the Data
 * Manager API. This is the primary Google bidding source; the GA4 purchase is
 * observation only and must stay out of the account's primary goals.
 *
 * The legacy UploadClickConversions endpoint is closed to new integrations
 * since 2026-06-15, so Data Manager is the only route for this account.
 * transactionId is the booking id, so a retried upload of the same purchase is
 * deduplicated by Google rather than counted twice.
 *
 * Outside production every request is sent with validateOnly, so staging can
 * exercise the integration without creating conversions.
 */
const CLICK_WINDOW_MS = 90 * MS_PER_DAY;

export function decideGoogleAds(ctx: DeliveryContext): DeliveryDecision {
  if (ctx.event.eventName !== 'purchase') return { action: 'skip', reason: 'UNSUPPORTED_EVENT' };
  if (
    !env.GOOGLE_ADS_CLIENT_ID ||
    !env.GOOGLE_ADS_CLIENT_SECRET ||
    !env.GOOGLE_ADS_REFRESH_TOKEN ||
    !env.GOOGLE_ADS_CUSTOMER_ID ||
    !env.GOOGLE_ADS_PURCHASE_CONVERSION_ACTION_ID
  ) {
    return { action: 'skip', reason: 'NOT_CONFIGURED' };
  }
  const blocked = consentSkip(ctx, 'marketing');
  if (blocked) return blocked;
  const a = ctx.attribution;
  if (!a || !(a.gclid || a.gbraid || a.wbraid)) return { action: 'skip', reason: 'NO_MATCH_DATA' };
  if (a.lastTouchAt && ctx.event.occurredAt.getTime() - a.lastTouchAt.getTime() > CLICK_WINDOW_MS) {
    return { action: 'skip', reason: 'TOO_OLD' };
  }
  return { action: 'send' };
}

export function buildDataManagerPayload(ctx: DeliveryContext) {
  const a = ctx.attribution!;
  // Exactly one click identifier: gbraid and wbraid together are rejected.
  const adIdentifiers = a.gclid ? { gclid: a.gclid } : a.gbraid ? { gbraid: a.gbraid } : { wbraid: a.wbraid };
  const customer = env.GOOGLE_ADS_CUSTOMER_ID!;
  return {
    destinations: [
      {
        operatingAccount: { accountType: 'GOOGLE_ADS', accountId: customer },
        loginAccount: { accountType: 'GOOGLE_ADS', accountId: env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || customer },
        productDestinationId: env.GOOGLE_ADS_PURCHASE_CONVERSION_ACTION_ID,
      },
    ],
    consent: { adUserData: 'CONSENT_GRANTED', adPersonalization: 'CONSENT_GRANTED' },
    validateOnly: !ctx.isProduction,
    events: [
      {
        eventTimestamp: ctx.event.occurredAt.toISOString(),
        transactionId: ctx.event.bookingId,
        conversionValue: toPlatformValue(ctx.event.value) ?? 0,
        currency: ctx.event.currency ?? DEFAULT_CURRENCY,
        eventSource: 'WEB',
        adIdentifiers,
      },
    ],
  };
}

export async function sendGoogleAds(ctx: DeliveryContext, fetchImpl?: typeof fetch): Promise<void> {
  const token = await googleAccessToken(fetchImpl);
  const { json } = await postJson('https://datamanager.googleapis.com/v1/events:ingest', buildDataManagerPayload(ctx), {
    label: 'google-datamanager',
    headers: { authorization: `Bearer ${token}` },
    fetchImpl,
  });
  const err = (json as { error?: { message?: string } } | null)?.error;
  if (err) throw new PermanentDeliveryError(`google-datamanager: ${String(err.message).slice(0, 300)}`);
}
