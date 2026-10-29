import { prisma } from '@/shared/server/db';
import type { Prisma } from '@prisma/client';

/**
 * Consent withdrawn after a booking was made.
 *
 * Bookings carry the consent given at booking time. When the visitor later
 * withdraws it (banner change) or asks an admin to (UU PDP request), the
 * snapshot is marked withdrawn, the matching identifiers are wiped, queued
 * deliveries are skipped, and the dispatcher re-checks the snapshot before
 * every send and every replay, so nothing more goes out.
 *
 * Limits: a visitor is linked to bookings only through the analytics visitor
 * id (gf_vid), which exists only if analytics consent was given. A visitor who
 * granted marketing consent alone cannot be matched from the banner, so their
 * withdrawal reaches past bookings only through the admin path, by booking.
 * Events already delivered cannot be recalled from the platforms.
 */
export type WithdrawalScope = { analytics: boolean; marketing: boolean };

const AD_IDENTIFIERS_CLEARED = {
  gclid: null,
  gbraid: null,
  wbraid: null,
  fbc: null,
  fbp: null,
  clientIpAddress: null,
  clientUserAgent: null,
} satisfies Prisma.BookingAttributionUpdateManyMutationInput;

const ANALYTICS_IDENTIFIERS_CLEARED = {
  gaClientId: null,
  gaSessionId: null,
} satisfies Prisma.BookingAttributionUpdateManyMutationInput;

function withdrawalData(scope: WithdrawalScope, now: Date): Prisma.BookingAttributionUpdateManyMutationInput {
  return {
    ...(scope.marketing ? { consentMarketing: false, ...AD_IDENTIFIERS_CLEARED } : {}),
    ...(scope.analytics ? { consentAnalytics: false, ...ANALYTICS_IDENTIFIERS_CLEARED } : {}),
    // Fully withdrawn only when nothing is left granted; a partial withdrawal
    // is carried by the consent flags themselves.
    ...(scope.marketing && scope.analytics ? { consentWithdrawnAt: now } : {}),
  };
}

async function skipQueuedDeliveries(bookingIds: string[], scope: WithdrawalScope): Promise<number> {
  if (bookingIds.length === 0) return 0;
  const destinations = [
    ...(scope.marketing ? (['GOOGLE_ADS', 'META_CAPI'] as const) : []),
    ...(scope.analytics ? (['GA4'] as const) : []),
  ];
  const res = await prisma.marketingEventDelivery.updateMany({
    where: {
      status: { in: ['PENDING', 'FAILED'] },
      destination: { in: [...destinations] },
      event: { bookingId: { in: bookingIds } },
    },
    data: { status: 'SKIPPED', skipReason: 'CONSENT_WITHDRAWN' },
  });
  return res.count;
}

/** Banner withdrawal: every booking made with this analytics visitor id. */
export async function withdrawConsentForVisitor(visitorId: string, scope: WithdrawalScope, now = new Date()) {
  if (!/^v_[a-f0-9]{8,32}$/.test(visitorId) || (!scope.analytics && !scope.marketing)) {
    return { attributions: 0, deliveriesSkipped: 0 };
  }
  const rows = await prisma.bookingAttribution.findMany({ where: { visitorId }, select: { bookingId: true } });
  const ids = rows.map((r) => r.bookingId);
  if (ids.length === 0) return { attributions: 0, deliveriesSkipped: 0 };
  const updated = await prisma.bookingAttribution.updateMany({ where: { bookingId: { in: ids } }, data: withdrawalData(scope, now) });
  const skipped = await skipQueuedDeliveries(ids, scope);
  return { attributions: updated.count, deliveriesSkipped: skipped };
}

/** Admin withdrawal on a customer's request, audited. */
export async function withdrawConsentForBooking(bookingId: string, adminId: string, now = new Date()) {
  const scope = { analytics: true, marketing: true };
  const updated = await prisma.bookingAttribution.updateMany({ where: { bookingId }, data: withdrawalData(scope, now) });
  const skipped = await skipQueuedDeliveries([bookingId], scope);
  await prisma.auditLog.create({
    data: {
      entityType: 'BOOKING',
      entityId: bookingId,
      action: 'marketing_consent_withdrawn',
      userRole: 'ADMIN',
      userId: adminId,
      newState: { attributionsUpdated: updated.count, deliveriesSkipped: skipped },
    },
  });
  return { attributions: updated.count, deliveriesSkipped: skipped };
}

/**
 * The consent a delivery may rely on now: the booking-time snapshot narrowed
 * by anything withdrawn since. Never widens.
 */
export function effectiveConsent(
  snapshot: { analytics: boolean; marketing: boolean },
  current: { consentAnalytics: boolean; consentMarketing: boolean; consentWithdrawnAt?: Date | null } | null,
): { analytics: boolean; marketing: boolean; withdrawn: boolean } {
  if (!current) return { ...snapshot, withdrawn: false };
  const withdrawn = current.consentWithdrawnAt != null;
  return {
    analytics: snapshot.analytics && current.consentAnalytics && !withdrawn,
    marketing: snapshot.marketing && current.consentMarketing && !withdrawn,
    withdrawn,
  };
}
