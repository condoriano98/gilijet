import { Prisma } from '@prisma/client';
import {
  ATTRIBUTION_COOKIE,
  decodeAttributionCookie,
  deviceClassFromUserAgent,
  fbcFromFbclid,
  gaClientIdFromCookie,
  gaSessionIdFromCookie,
  resolveAttribution,
  type ResolvedAttribution,
} from '@/features/marketing/attribution';
import { CONSENT_COOKIE, parseConsent, type ConsentState } from '@/features/marketing/consent';
import { eventsEnabled } from '@/features/marketing/config';
import { truncate } from '@/features/marketing/privacy';
import { env } from '@/shared/server/env';

export const VISITOR_COOKIE = 'gf_vid';

/** What the booking request carried, read from cookies and headers by the route. */
export type BookingAttributionInput = {
  consent: ConsentState;
  resolved: ResolvedAttribution;
  visitorId: string | null;
  gaClientId: string | null;
  gaSessionId: string | null;
  fbp: string | null;
  fbc: string | null;
  clientIpAddress: string | null;
  clientUserAgent: string | null;
  deviceClass: 'mobile' | 'tablet' | 'desktop' | null;
};

type CookieGetter = (name: string) => string | undefined;

/**
 * Build the snapshot from the request. Identifiers are only read when the
 * matching consent was given; with none, the result records that consent
 * was unavailable and nothing else.
 */
export function readBookingAttribution(args: {
  cookie: CookieGetter;
  allCookieNames?: string[];
  userAgent: string | null;
  ip: string | null;
  now?: number;
}): BookingAttributionInput {
  const consent = parseConsent(args.cookie(CONSENT_COOKIE));
  const resolved = resolveAttribution({
    cookie: consent.analytics || consent.marketing ? decodeAttributionCookie(args.cookie(ATTRIBUTION_COOKIE)) : null,
    consent,
    lookbackDays: env.ATTRIBUTION_LOOKBACK_DAYS,
    now: args.now,
  });
  const gaSessionCookie = (args.allCookieNames ?? []).find((n) => n.startsWith('_ga_'));
  const fbclid = resolved.lastTouch?.fbclid;
  const ua = args.userAgent ? truncate(args.userAgent, 400) : null;
  return {
    consent,
    resolved,
    visitorId: consent.analytics ? cleanId(args.cookie(VISITOR_COOKIE)) : null,
    gaClientId: consent.analytics ? gaClientIdFromCookie(args.cookie('_ga')) : null,
    gaSessionId: consent.analytics && gaSessionCookie ? gaSessionIdFromCookie(args.cookie(gaSessionCookie)) : null,
    fbp: consent.marketing ? cleanId(args.cookie('_fbp'), 120) : null,
    fbc: consent.marketing
      ? cleanId(args.cookie('_fbc'), 300) ?? (fbclid && resolved.lastTouch ? fbcFromFbclid(fbclid, resolved.lastTouch.at) : null)
      : null,
    clientIpAddress: consent.marketing && args.ip ? truncate(args.ip.split(',')[0].trim(), 64) : null,
    clientUserAgent: consent.marketing ? ua : null,
    deviceClass: deviceClassFromUserAgent(ua),
  };
}

function cleanId(v: string | undefined, max = 64): string | null {
  if (!v) return null;
  const t = v.trim();
  return /^[A-Za-z0-9._-]+$/.test(t) ? truncate(t, max) : null;
}

/**
 * Persist the snapshot inside the booking transaction, under a savepoint so a
 * failure here can never roll back the booking.
 */
export async function saveBookingAttribution(
  tx: Prisma.TransactionClient,
  bookingId: string,
  input: BookingAttributionInput,
): Promise<void> {
  if (!eventsEnabled()) return;
  const { resolved, consent } = input;
  const lt = resolved.lastTouch;
  const ft = resolved.firstTouch;
  await tx.$executeRawUnsafe('SAVEPOINT marketing_attribution');
  try {
    await tx.bookingAttribution.createMany({
      skipDuplicates: true,
      data: [
        {
          bookingId,
          modelVersion: resolved.modelVersion,
          lookbackDays: resolved.lookbackDays,
          consentAnalytics: consent.analytics,
          consentMarketing: consent.marketing,
          visitorId: input.visitorId,
          channel: resolved.channel,
          platform: resolved.platform,
          utmSource: lt?.src ?? null,
          utmMedium: lt?.med ?? null,
          utmCampaign: lt?.cmp ?? null,
          utmContent: lt?.cnt ?? null,
          utmTerm: lt?.trm ?? null,
          campaignId: lt?.cid ?? null,
          adGroupId: lt?.agid ?? null,
          adId: lt?.adid ?? null,
          lastTouchAt: lt ? new Date(lt.at) : null,
          firstTouchAt: ft ? new Date(ft.at) : null,
          firstTouch: ft ? withoutClickIds(ft) : Prisma.JsonNull,
          lastTouch: lt ? withoutClickIds(lt) : Prisma.JsonNull,
          landingPath: lt?.lp ?? null,
          referrerHost: lt?.ref ?? null,
          deviceClass: input.deviceClass,
          gclid: consent.marketing ? lt?.gclid ?? null : null,
          gbraid: consent.marketing ? lt?.gbraid ?? null : null,
          wbraid: consent.marketing ? lt?.wbraid ?? null : null,
          fbc: input.fbc,
          fbp: input.fbp,
          gaClientId: input.gaClientId,
          gaSessionId: input.gaSessionId,
          clientIpAddress: input.clientIpAddress,
          clientUserAgent: input.clientUserAgent,
        },
      ],
    });
    await tx.$executeRawUnsafe('RELEASE SAVEPOINT marketing_attribution');
  } catch (err) {
    await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT marketing_attribution').catch(() => undefined);
    console.error('[marketing] could not save attribution:', err instanceof Error ? err.message : err);
  }
}

/** The JSON snapshots are reportable; identifiers live only in their own columns. */
function withoutClickIds(t: NonNullable<ResolvedAttribution['lastTouch']>) {
  const { gclid: _g, gbraid: _gb, wbraid: _wb, fbclid: _f, ...rest } = t;
  return rest;
}
