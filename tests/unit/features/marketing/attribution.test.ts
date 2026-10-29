import { describe, it, expect } from 'vitest';
import {
  classifyTouch,
  decodeAttributionCookie,
  encodeAttributionCookie,
  gaClientIdFromCookie,
  gaSessionIdFromCookie,
  mergeTouch,
  resolveAttribution,
  touchFromLanding,
} from '@/features/marketing/attribution';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 26, 3, 0, 0);
const both = { analytics: true, marketing: true };

describe('touchFromLanding', () => {
  it('captures Google auto-tagging with consent', () => {
    const t = touchFromLanding({
      url: 'https://gilifast.com/?gclid=Cj0abc&gad_source=1&gad_campaignid=123&gf_agid=456&gf_adid=789',
      allowClickIds: true,
      now: NOW,
    });
    expect(t).toMatchObject({ gclid: 'Cj0abc', cid: '123', agid: '456', adid: '789', clk: 'g', gads: '1' });
    expect(classifyTouch(t)).toBe('google_ads');
  });

  it('drops the click id value without marketing consent but still classifies', () => {
    const t = touchFromLanding({ url: 'https://gilifast.com/?gclid=Cj0abc', allowClickIds: false, now: NOW });
    expect(t?.gclid).toBeUndefined();
    expect(t?.clk).toBe('g');
    expect(classifyTouch(t)).toBe('google_ads');
  });

  it('classifies Meta paid traffic by its URL parameters, organic fbclid as social', () => {
    const paid = touchFromLanding({
      url: 'https://gilifast.com/?utm_source=facebook&utm_medium=paid_social&utm_id=120200&fbclid=IwAR',
      allowClickIds: true,
      now: NOW,
    });
    expect(classifyTouch(paid)).toBe('meta_ads');
    expect(paid?.cid).toBe('120200');
    const organic = touchFromLanding({ url: 'https://gilifast.com/?fbclid=IwAR', allowClickIds: true, now: NOW });
    expect(classifyTouch(organic)).toBe('social');
  });

  it('classifies search engines without paid signals as organic', () => {
    const t = touchFromLanding({ url: 'https://gilifast.com/', referrer: 'https://www.google.com/', allowClickIds: true, now: NOW });
    expect(classifyTouch(t)).toBe('organic_search');
  });

  it('returns no touch for a direct visit or a DOKU/PayPal return', () => {
    expect(touchFromLanding({ url: 'https://gilifast.com/b/GF-1', allowClickIds: true })).toBeNull();
    expect(
      touchFromLanding({ url: 'https://gilifast.com/b/GF-1', referrer: 'https://checkout.doku.com/x', allowClickIds: true }),
    ).toBeNull();
    expect(
      touchFromLanding({ url: 'https://gilifast.com/pay/GF-1', referrer: 'https://www.paypal.com/', allowClickIds: true }),
    ).toBeNull();
  });

  it('masks the booking reference in the stored landing path', () => {
    const t = touchFromLanding({ url: 'https://gilifast.com/b/GF-ABC?utm_source=wa&utm_medium=referral', allowClickIds: true });
    expect(t?.lp).toBe('/b/:id?utm_source=wa&utm_medium=referral');
  });
});

describe('mergeTouch and resolveAttribution', () => {
  const google = touchFromLanding({ url: 'https://gilifast.com/?gclid=G1', allowClickIds: true, now: NOW - 10 * DAY })!;
  const meta = touchFromLanding({
    url: 'https://gilifast.com/?utm_source=facebook&utm_medium=paid_social&utm_id=9',
    allowClickIds: true,
    now: NOW - 2 * DAY,
  })!;

  it('keeps the first touch and moves the last touch; a direct return changes nothing', () => {
    let c = mergeTouch(null, google);
    c = mergeTouch(c, meta);
    c = mergeTouch(c, null);
    expect(c?.ft?.gclid).toBe('G1');
    expect(c?.lt?.cid).toBe('9');
  });

  it('attributes to the last non-direct touch inside the lookback', () => {
    const r = resolveAttribution({ cookie: mergeTouch(mergeTouch(null, google), meta), consent: both, lookbackDays: 30, now: NOW });
    expect(r.channel).toBe('meta_ads');
    expect(r.platform).toBe('meta');
    expect(r.firstTouch?.gclid).toBe('G1');
  });

  it('falls back to direct when the last touch is older than the lookback', () => {
    const r = resolveAttribution({ cookie: mergeTouch(null, google), consent: both, lookbackDays: 7, now: NOW });
    expect(r.channel).toBe('direct');
    expect(r.lastTouch).toBeNull();
    expect(r.firstTouch).not.toBeNull();
  });

  it('reports consent_unavailable without consent and keeps nothing', () => {
    const r = resolveAttribution({ cookie: mergeTouch(null, google), consent: { analytics: false, marketing: false }, lookbackDays: 30, now: NOW });
    expect(r.channel).toBe('consent_unavailable');
    expect(r.firstTouch).toBeNull();
  });

  it('survives a cookie round trip and rejects tampered values', () => {
    const c = mergeTouch(null, google)!;
    expect(decodeAttributionCookie(encodeAttributionCookie(c))?.lt?.gclid).toBe('G1');
    expect(decodeAttributionCookie('%7B%22v%22%3A2%7D')).toBeNull();
    const tampered = encodeURIComponent(JSON.stringify({ v: 1, lt: { at: 'soon', gclid: 'x' } }));
    expect(decodeAttributionCookie(tampered)?.lt).toBeUndefined();
  });
});

describe('GA cookie parsing', () => {
  it('reads the client id and both session cookie formats', () => {
    expect(gaClientIdFromCookie('GA1.1.1234567890.1761400000')).toBe('1234567890.1761400000');
    expect(gaClientIdFromCookie('junk')).toBeNull();
    expect(gaSessionIdFromCookie('GS1.1.1761470000.3.1.1761470100.0.0.0')).toBe('1761470000');
    expect(gaSessionIdFromCookie('GS2.1.s1761470000$o3$g1$t1761470100$j60$l0$h0')).toBe('1761470000');
  });
});
