import type { BookingAttribution, MarketingEvent } from '@prisma/client';

/** What an adapter gets: the stored event plus the booking's matching data. */
export type DeliveryContext = {
  event: Pick<
    MarketingEvent,
    | 'eventId'
    | 'eventName'
    | 'occurredAt'
    | 'bookingId'
    | 'routeCode'
    | 'legId'
    | 'passengerCount'
    | 'currency'
    | 'value'
    | 'consent'
    | 'environment'
  >;
  attribution: Pick<
    BookingAttribution,
    | 'consentAnalytics'
    | 'consentMarketing'
    | 'gclid'
    | 'gbraid'
    | 'wbraid'
    | 'fbc'
    | 'fbp'
    | 'gaClientId'
    | 'gaSessionId'
    | 'clientIpAddress'
    | 'clientUserAgent'
    | 'landingPath'
    | 'lastTouchAt'
  > | null;
  /**
   * Consent the send may rely on now: the snapshot taken at booking time,
   * narrowed by any withdrawal since (consent-withdrawal.ts). Adapters read
   * this, never the raw snapshot, so a withdrawal stops sends and replays.
   */
  consent: { analytics: boolean; marketing: boolean; withdrawn: boolean };
  now: Date;
  isProduction: boolean;
  appBaseUrl: string;
};

export type DeliveryDecision =
  | { action: 'send' }
  | { action: 'skip'; reason: 'NO_CONSENT' | 'CONSENT_WITHDRAWN' | 'NOT_CONFIGURED' | 'NO_MATCH_DATA' | 'TOO_OLD' | 'UNSUPPORTED_EVENT' };

export function consentSkip(ctx: DeliveryContext, needs: 'analytics' | 'marketing'): DeliveryDecision | null {
  if (ctx.consent[needs]) return null;
  return { action: 'skip', reason: ctx.consent.withdrawn ? 'CONSENT_WITHDRAWN' : 'NO_CONSENT' };
}
