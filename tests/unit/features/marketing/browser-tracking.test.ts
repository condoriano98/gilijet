import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  eventsEnabled: true,
  record: vi.fn(async () => 'search_x'),
}));

vi.mock('@/features/marketing/config', () => ({ eventsEnabled: () => mocks.eventsEnabled }));
vi.mock('@/features/marketing/events', () => ({ recordMarketingEvent: mocks.record }));
vi.mock('@/shared/server/env', () => ({ env: { ATTRIBUTION_LOOKBACK_DAYS: 30 } }));
vi.mock('@/shared/server/db', () => ({
  prisma: { $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({}) },
}));

import { gtmBootstrapScript, isValidGtmId } from '@/features/marketing/components/gtm-snippet';
import { allowCollect, handleCollect } from '@/features/marketing/collect';
import { pushDataLayer } from '@/features/marketing/data-layer';
import { serializeConsent } from '@/features/marketing/consent';
import { sanitizePageLocation } from '@/features/marketing/privacy';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.eventsEnabled = true;
});

describe('GTM bootstrap', () => {
  it('sets denied consent defaults before the container is requested', () => {
    const js = gtmBootstrapScript('GTM-ABC1234');
    const defaultAt = js.indexOf("gtag('consent','default'");
    const gtmAt = js.indexOf('googletagmanager.com/gtm.js');
    expect(defaultAt).toBeGreaterThan(-1);
    expect(gtmAt).toBeGreaterThan(defaultAt);
    expect(js).toContain("analytics_storage:'denied'");
    expect(js).toContain("ad_user_data:'denied'");
  });

  it('applies a stored choice through a regex that matches the real cookie format', () => {
    const js = gtmBootstrapScript('GTM-ABC1234');
    const re = /match\(\/(.+?)\/\)/.exec(js)![1];
    const m = new RegExp(re).exec(`foo=1; gf_consent=${serializeConsent({ analytics: true, marketing: false })}`);
    expect(m?.[1]).toBe('1');
    expect(m?.[2]).toBe('0');
  });

  it('refuses anything that is not a GTM container id', () => {
    expect(isValidGtmId('GTM-ABC1234')).toBe(true);
    expect(isValidGtmId("GTM-1');alert(1)//")).toBe(false);
    expect(() => gtmBootstrapScript("x');alert(1);//")).toThrow();
  });
});

describe('page_location sanitizer', () => {
  it('masks booking references and keeps click ids for GA4 attribution', () => {
    expect(sanitizePageLocation('https://gilifast.com/b/GF-ABC123?ok=1')).toBe('https://gilifast.com/b/:id');
    expect(sanitizePageLocation('https://gilifast.com/?gclid=abc&email=x@y.z&utm_source=google')).toBe(
      'https://gilifast.com/?gclid=abc&utm_source=google',
    );
  });
});

describe('dataLayer guard', () => {
  const g = globalThis as unknown as { window?: { dataLayer?: unknown[] } };
  beforeEach(() => {
    g.window = { dataLayer: [] };
  });
  afterEach(() => {
    delete g.window;
  });

  it('pushes contract events and refuses personal data', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(pushDataLayer({ event: 'search', route: 'PDB-GTA', departure_date: '2026-11-01' })).toBe(true);
    expect(pushDataLayer({ event: 'purchase', customer_email: 'a@b.co' })).toBe(false);
    expect(pushDataLayer({ event: 'purchase', note: '+62 812 3456 7890' })).toBe(false);
    expect(g.window!.dataLayer).toHaveLength(1);
    warn.mockRestore();
  });
});

describe('collect endpoint', () => {
  const consented = { gf_consent: serializeConsent({ analytics: true, marketing: false }), gf_vid: 'v_0123456789abcdef0123' };
  const body = (over: Record<string, unknown> = {}) =>
    JSON.stringify({ event_id: '3f2b1c4d-aaaa-bbbb-cccc-1234567890ab', event_name: 'search', route: 'PDB-GTA', departure_date: '2026-11-01', passenger_count: 2, ...over });

  it('records a consented search without personal data', async () => {
    const out = await handleCollect({ rawBody: body(), ip: '10.0.0.1', cookie: (n) => (consented as Record<string, string>)[n] });
    expect(out).toEqual({ status: 202, recorded: true });
    expect(mocks.record).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        eventName: 'search',
        source: 'BROWSER',
        routeCode: 'PDB-GTA',
        visitorId: 'v_0123456789abcdef0123',
        consent: { analytics: true, marketing: false, decided: true },
      }),
    );
  });

  it('drops events without analytics consent and while events are off', async () => {
    expect(await handleCollect({ rawBody: body(), ip: '10.0.0.2', cookie: () => undefined })).toEqual({ status: 204 });
    mocks.eventsEnabled = false;
    expect(await handleCollect({ rawBody: body(), ip: '10.0.0.2', cookie: (n) => (consented as Record<string, string>)[n] })).toEqual({ status: 204 });
    expect(mocks.record).not.toHaveBeenCalled();
  });

  it('rejects unknown fields, server-only events, oversize bodies and PII', async () => {
    const c = (n: string) => (consented as Record<string, string>)[n];
    expect((await handleCollect({ rawBody: body({ email: 'a@b.co' }), ip: '10.0.0.3', cookie: c })).status).toBe(400);
    expect((await handleCollect({ rawBody: body({ event_name: 'purchase' }), ip: '10.0.0.3', cookie: c })).status).toBe(400);
    expect((await handleCollect({ rawBody: 'x'.repeat(5000), ip: '10.0.0.3', cookie: c })).status).toBe(413);
    expect((await handleCollect({ rawBody: '{nope', ip: '10.0.0.3', cookie: c })).status).toBe(400);
    expect(mocks.record).not.toHaveBeenCalled();
  });

  it('rate-limits a single client', () => {
    const now = Date.now();
    let allowed = 0;
    for (let i = 0; i < 80; i++) if (allowCollect('10.9.9.9', now)) allowed++;
    expect(allowed).toBe(60);
    expect(allowCollect('10.9.9.9', now + 61_000)).toBe(true);
  });
});
