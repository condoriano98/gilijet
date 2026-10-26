import { z } from 'zod';

/**
 * The analytics event contract: one dictionary for the internal event ledger,
 * the browser dataLayer, GA4, Google Ads and Meta.
 *
 * GiliFast's real order (checked in src/features/booking/engine.ts and
 * src/features/tickets/ticket-issuer.ts) is: booking created PENDING_PAYMENT →
 * DOKU payment verified → AWAITING_CONFIRMATION → admin confirms with the
 * operator by phone → CONFIRMED with tickets in the same transaction. So
 * `purchase` comes before `seat_confirmed`, and `ticket_issued` is recorded
 * alongside it.
 */
export const SCHEMA_VERSION = 1;

export const EVENT_NAMES = [
  'page_view',
  'search',
  'view_item',
  'booking_request_created',
  'begin_checkout',
  'payment_failed',
  'purchase',
  'seat_confirmed',
  'ticket_issued',
  'booking_cancelled',
  'refund',
  'unmatched_late_payment',
] as const;
export type EventName = (typeof EVENT_NAMES)[number];

export type EventAuthority = 'browser' | 'backend';

/**
 * Where each event is sent. `ga4` and the browser columns are what the GTM
 * container fires from the dataLayer; `server` lists the server-side
 * destinations the outbox delivers to. Operational events stay internal.
 */
export const EVENT_DICTIONARY: Record<
  EventName,
  {
    authority: EventAuthority;
    trigger: string;
    /** Recorded once per booking (enforced by MarketingEvent.dedupeKey). */
    oncePerBooking: boolean;
    ga4: string | null;
    meta: string | null;
    googleAds: 'purchase' | null;
    server: Array<'GA4' | 'GOOGLE_ADS' | 'META_CAPI'>;
  }
> = {
  page_view: { authority: 'browser', trigger: 'Route change in the customer area, including client-side navigation', oncePerBooking: false, ga4: 'page_view', meta: 'PageView', googleAds: null, server: [] },
  search: { authority: 'browser', trigger: 'Search results rendered for a valid route/date query', oncePerBooking: false, ga4: 'search', meta: 'Search', googleAds: null, server: [] },
  view_item: { authority: 'browser', trigger: 'Book page rendered for a specific departure (one-way leg or round-trip pair)', oncePerBooking: false, ga4: 'view_item', meta: 'ViewContent', googleAds: null, server: [] },
  booking_request_created: { authority: 'backend', trigger: 'Booking row committed in PENDING_PAYMENT', oncePerBooking: true, ga4: 'booking_request_created', meta: null, googleAds: null, server: [] },
  // Internal only: the checkout is created inside a server action that
  // redirects straight to DOKU, so no browser page exists after the session
  // is confirmed to fire a tag from. Firing on the Pay button would count
  // attempts, not initiated sessions.
  begin_checkout: { authority: 'backend', trigger: 'DOKU checkout session or PayPal order created for the booking', oncePerBooking: false, ga4: null, meta: null, googleAds: null, server: [] },
  payment_failed: { authority: 'backend', trigger: 'Signature-verified gateway notification reporting a failed attempt', oncePerBooking: false, ga4: null, meta: null, googleAds: null, server: [] },
  purchase: { authority: 'backend', trigger: 'First verified successful payment for the booking (PENDING_PAYMENT → AWAITING_CONFIRMATION)', oncePerBooking: true, ga4: 'purchase', meta: 'Purchase', googleAds: 'purchase', server: ['GA4', 'GOOGLE_ADS', 'META_CAPI'] },
  seat_confirmed: { authority: 'backend', trigger: 'Admin confirmed availability with the operator (AWAITING_CONFIRMATION → CONFIRMED)', oncePerBooking: true, ga4: null, meta: null, googleAds: null, server: [] },
  ticket_issued: { authority: 'backend', trigger: 'Tickets minted, in the same transaction as seat_confirmed', oncePerBooking: true, ga4: null, meta: null, googleAds: null, server: [] },
  booking_cancelled: { authority: 'backend', trigger: 'Booking moved to CANCELLED_BY_CUSTOMER, CANCELLED_BY_OPERATOR or EXPIRED', oncePerBooking: true, ga4: null, meta: null, googleAds: null, server: [] },
  refund: { authority: 'backend', trigger: 'Refund marked COMPLETED (money returned), full or partial', oncePerBooking: false, ga4: 'refund', meta: null, googleAds: null, server: ['GA4'] },
  // Money for a booking already expired or cancelled: an operational
  // exception, never a purchase, never sent to a platform.
  unmatched_late_payment: { authority: 'backend', trigger: 'Verified gateway payment arrived for an EXPIRED or CANCELLED_* booking', oncePerBooking: true, ga4: null, meta: null, googleAds: null, server: [] },
};

/** Events the public collect endpoint accepts; everything else is server-only. */
export const BROWSER_COLLECTABLE = ['search', 'view_item'] as const;

const routeCode = z.string().regex(/^[A-Z0-9]{2,8}-[A-Z0-9]{2,8}$/);
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Body of POST /api/marketing/collect. Unknown keys are rejected. */
export const collectEventSchema = z
  .object({
    event_id: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
    event_name: z.enum(BROWSER_COLLECTABLE),
    page_path: z.string().max(300).optional(),
    route: routeCode.optional(),
    leg_id: z.string().max(40).optional(),
    departure_date: ymd.optional(),
    passenger_count: z.number().int().min(1).max(20).optional(),
    trip_type: z.enum(['ONE_WAY', 'ROUND_TRIP']).optional(),
  })
  .strict();
export type CollectEvent = z.infer<typeof collectEventSchema>;

/** Stable ids: providers deduplicate on these, so retries must reuse them. */
export function bookingEventId(eventName: EventName, bookingId: string): string {
  return `${eventName}_${bookingId}`;
}

export function refundEventId(refundId: string): string {
  return `refund_${refundId}`;
}

/** The key that makes once-per-booking events unique in the database. */
export function dedupeKeyFor(eventName: EventName, bookingId: string | null, refundId?: string | null): string | null {
  if (eventName === 'refund' && refundId) return `refund:${refundId}`;
  if (bookingId && EVENT_DICTIONARY[eventName].oncePerBooking) return `${eventName}:${bookingId}`;
  return null;
}
