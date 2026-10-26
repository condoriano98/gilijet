'use client';

import { useEffect } from 'react';
import { CONSENT_COOKIE, parseConsent } from '@/features/marketing/consent';
import { pushDataLayer, readCookie } from '@/features/marketing/data-layer';

type Primitive = string | number | boolean | null;

/** Event ids already pushed in this page lifetime (reloads are deduped by the platforms). */
const pushed = new Set<string>();

/**
 * Push one contract event to the dataLayer when the component mounts, and
 * for search/view_item also record it in the internal funnel through the
 * collect endpoint. `requires` names the consent the event needs; without it
 * nothing is pushed or sent.
 */
export function TrackEvent({
  eventId,
  name,
  params,
  requires,
  collect,
}: {
  eventId: string;
  name: 'search' | 'view_item' | 'purchase';
  params: Record<string, Primitive | Array<Record<string, Primitive>>>;
  requires: 'analytics' | 'marketing';
  collect?: Record<string, Primitive>;
}) {
  useEffect(() => {
    if (pushed.has(eventId)) return;
    const consent = parseConsent(readCookie(CONSENT_COOKIE));
    if (!consent[requires]) return;
    pushed.add(eventId);
    pushDataLayer({ event: name, event_id: eventId, ...params });
    if (collect && consent.analytics) {
      // The collect schema is strict and takes no nulls: unknown values are left out.
      const fields = Object.fromEntries(Object.entries(collect).filter(([, v]) => v !== null && v !== undefined));
      const body = JSON.stringify({ event_id: eventId, event_name: name, ...fields });
      const blob = new Blob([body], { type: 'application/json' });
      if (!navigator.sendBeacon?.('/api/marketing/collect', blob)) {
        void fetch('/api/marketing/collect', { method: 'POST', body, headers: { 'content-type': 'application/json' }, keepalive: true }).catch(() => undefined);
      }
    }
  }, [eventId, name, params, requires, collect]);
  return null;
}
