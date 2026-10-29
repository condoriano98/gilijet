'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import {
  ATTRIBUTION_COOKIE,
  decodeAttributionCookie,
  directLanding,
  encodeAttributionCookie,
  mergeTouch,
  touchFromLanding,
} from '@/features/marketing/attribution';
import { CONSENT_COOKIE, parseConsent } from '@/features/marketing/consent';
import { sanitizePageLocation, sanitizePath } from '@/features/marketing/privacy';
import {
  CONSENT_CHANGED_EVENT,
  deleteCookie,
  pushDataLayer,
  readCookie,
  writeCookie,
} from '@/features/marketing/data-layer';
import { ATTRIBUTION_COOKIE_MAX_AGE_SECONDS, VISITOR_COOKIE, VISITOR_MAX_AGE_SECONDS } from '@/features/marketing/constants';

/**
 * A landing seen before the visitor answered the banner. Kept in memory only
 * (no storage without consent) and applied if they then say yes, so the ad
 * click that brought them is not lost to the banner.
 */
let pendingLanding: { url: string; referrer: string; at: number } | null = null;

function captureLanding(url: string, referrer: string, at: number): void {
  const consent = parseConsent(readCookie(CONSENT_COOKIE));
  if (!consent.analytics && !consent.marketing) {
    if (!consent.decided && !pendingLanding) pendingLanding = { url, referrer, at };
    return;
  }
  const existing = decodeAttributionCookie(readCookie(ATTRIBUTION_COOKIE));
  // A first visit with no campaign signal is recorded as direct, so a later
  // booking can tell "came direct" from "no evidence".
  const touch = touchFromLanding({ url, referrer, now: at, allowClickIds: consent.marketing }) ?? (existing ? null : directLanding(url, at));
  if (!touch) return;
  const merged = mergeTouch(existing, touch);
  if (merged) writeCookie(ATTRIBUTION_COOKIE, encodeAttributionCookie(merged), ATTRIBUTION_COOKIE_MAX_AGE_SECONDS);
}

function ensureVisitorId(): void {
  if (readCookie(VISITOR_COOKIE)) return;
  const id = `v_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
  writeCookie(VISITOR_COOKIE, id, VISITOR_MAX_AGE_SECONDS);
}

function RuntimeInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastPushed = useRef<string | null>(null);
  const previousLocation = useRef<string | null>(null);
  const firstLoad = useRef(true);

  // Consent changes: create or drop first-party measurement cookies.
  useEffect(() => {
    const onChange = (e: Event) => {
      const choice = (e as CustomEvent<{ analytics: boolean; marketing: boolean }>).detail;
      if (choice.analytics) ensureVisitorId();
      else deleteCookie(VISITOR_COOKIE);
      if (!choice.analytics && !choice.marketing) {
        deleteCookie(ATTRIBUTION_COOKIE);
        pendingLanding = null;
        return;
      }
      if (pendingLanding) {
        captureLanding(pendingLanding.url, pendingLanding.referrer, pendingLanding.at);
        pendingLanding = null;
      }
    };
    window.addEventListener(CONSENT_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(CONSENT_CHANGED_EVENT, onChange);
  }, []);

  // One page_view per real navigation. The ref guards React's dev
  // double-invoke and re-renders with the same URL, so a navigation is never
  // counted twice; GA4's own automatic page_view is switched off in GTM.
  useEffect(() => {
    const href = window.location.href;
    const key = `${pathname}?${searchParams?.toString() ?? ''}`;
    if (lastPushed.current === key) return;
    lastPushed.current = key;

    const referrer = firstLoad.current ? document.referrer : '';
    captureLanding(href, referrer, Date.now());
    if (parseConsent(readCookie(CONSENT_COOKIE)).analytics) ensureVisitorId();

    pushDataLayer({
      event: 'page_view',
      page_location: sanitizePageLocation(href),
      page_path: sanitizePath(pathname ?? '/'),
      page_referrer: firstLoad.current ? sanitizePageLocation(document.referrer) : previousLocation.current,
      page_title: document.title,
    });
    previousLocation.current = sanitizePageLocation(href);
    firstLoad.current = false;
  }, [pathname, searchParams]);

  return null;
}

/** useSearchParams needs a Suspense boundary to keep the layout static. */
export function MarketingRuntime() {
  return (
    <Suspense fallback={null}>
      <RuntimeInner />
    </Suspense>
  );
}
