import { describe, it, expect } from 'vitest';
import {
  DENIED,
  parseConsent,
  serializeConsent,
  toGoogleConsentMode,
} from '@/features/marketing/consent';
import {
  containsPii,
  referrerHost,
  sanitizePath,
  sanitizeUrl,
  scrubError,
} from '@/features/marketing/privacy';

describe('consent cookie', () => {
  it('round-trips a decision', () => {
    const raw = serializeConsent({ analytics: true, marketing: false }, 1761470000000);
    expect(raw).toBe('v1.a1.m0.1761470000000');
    expect(parseConsent(raw)).toEqual({ analytics: true, marketing: false, decided: true, decidedAt: 1761470000000 });
  });

  it('treats missing, malformed or old-version cookies as denied', () => {
    expect(parseConsent(undefined)).toEqual(DENIED);
    expect(parseConsent('yes')).toEqual(DENIED);
    expect(parseConsent('v0.a1.m1.1761470000000')).toEqual(DENIED);
  });

  it('maps marketing to all three Google ad consent types', () => {
    expect(toGoogleConsentMode({ analytics: false, marketing: true })).toEqual({
      analytics_storage: 'denied',
      ad_storage: 'granted',
      ad_user_data: 'granted',
      ad_personalization: 'granted',
    });
  });
});

describe('privacy guards', () => {
  it('masks booking references in capability routes', () => {
    expect(sanitizePath('/b/GF-ABC123')).toBe('/b/:id');
    expect(sanitizePath('/id/pay/GF-ABC123?x=1')).toBe('/id/pay/:id');
    expect(sanitizePath('/checkout/GF-1')).toBe('/checkout/:id');
    expect(sanitizePath('/search')).toBe('/search');
  });

  it('keeps only reportable params and drops click ids, emails and fragments', () => {
    const out = sanitizeUrl('https://gilifast.com/search?utm_source=google&gclid=abc&email=a@b.co&origin=PDB#x');
    expect(out).toBe('/search?utm_source=google');
  });

  it('keeps only the referrer host', () => {
    expect(referrerHost('https://www.google.com/search?q=gili+boat')).toBe('www.google.com');
    expect(referrerHost('not a url')).toBeNull();
  });

  it('detects emails, phone numbers and PII-named keys', () => {
    expect(containsPii({ page: '/x', note: 'mail me at a@b.com' })).toBe(true);
    expect(containsPii({ v: '+62 812-3456-7890' })).toBe(true);
    expect(containsPii({ customer_name: '' })).toBe(true);
    expect(containsPii({ passport: 'X' })).toBe(true);
  });

  it('does not flag dates, routes, ids and money', () => {
    expect(
      containsPii({
        event_name: 'purchase',
        departure_date: '2026-10-26',
        occurred_at: '2026-10-26T10:00:00.000Z',
        route: 'PDB-GTA',
        transaction_id: 'purchase_cmh2x9k0a0001',
        value: 1250000,
        items: [{ item_id: 'leg_123', item_name: 'PDB-GTA' }],
      }),
    ).toBe(false);
  });

  it('redacts tokens from error messages', () => {
    const msg = scrubError(new Error('401 access_token=EAAB1234567890abcdefghijk Bearer ya29.abc-def'));
    expect(msg).not.toContain('EAAB1234567890');
    expect(msg).not.toContain('ya29');
  });
});
