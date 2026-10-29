import { prisma } from '@/shared/server/db';
import { eventsEnabled } from '@/features/marketing/config';
import { bookingEventId } from '@/features/marketing/contract';
import { toPlatformValue } from '@/features/marketing/money';
import { DEFAULT_CURRENCY } from '@/shared/constants/locale';

export type BrowserPurchase = {
  eventId: string;
  transactionId: string;
  value: number;
  currency: string;
  route: string | null;
  passengers: number;
};

/**
 * The browser copy of a purchase, for the booking page the customer returns
 * to from DOKU. It exists only once the backend has recorded the verified
 * payment, and reuses that event's id so Meta deduplicates the Pixel copy
 * against the Conversions API one. A customer who never returns loses
 * nothing: the server copy is sent regardless.
 */
export async function loadBrowserPurchase(bookingId: string): Promise<BrowserPurchase | null> {
  if (!eventsEnabled()) return null;
  try {
    const event = await prisma.marketingEvent.findUnique({
      where: { eventId: bookingEventId('purchase', bookingId) },
      select: { eventId: true, value: true, currency: true, routeCode: true, passengerCount: true },
    });
    if (!event) return null;
    return {
      eventId: event.eventId,
      transactionId: bookingId,
      value: toPlatformValue(event.value) ?? 0,
      currency: event.currency ?? DEFAULT_CURRENCY,
      route: event.routeCode,
      passengers: event.passengerCount ?? 1,
    };
  } catch (err) {
    console.error('[marketing] browser purchase lookup failed:', err instanceof Error ? err.message : err);
    return null;
  }
}
