import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  attributionFindMany: vi.fn(),
  attributionUpdateMany: vi.fn(),
  deliveryUpdateMany: vi.fn(),
  auditCreate: vi.fn(async () => ({})),
  eventsEnabled: true,
}));

vi.mock('@/shared/server/env', () => ({ env: { ATTRIBUTION_LOOKBACK_DAYS: 30 } }));
vi.mock('@/shared/server/db', () => ({
  prisma: {
    bookingAttribution: { findMany: mocks.attributionFindMany, updateMany: mocks.attributionUpdateMany },
    marketingEventDelivery: { updateMany: mocks.deliveryUpdateMany },
    auditLog: { create: mocks.auditCreate },
  },
}));
vi.mock('@/features/marketing/config', () => ({ eventsEnabled: () => mocks.eventsEnabled }));

import {
  channelGroup,
  classifyTouch,
  directLanding,
  mergeTouch,
  resolveAttribution,
  touchFromLanding,
} from '@/features/marketing/attribution';
import {
  effectiveConsent,
  withdrawConsentForBooking,
  withdrawConsentForVisitor,
} from '@/features/marketing/consent-withdrawal';
import { POST as consentRoute } from '@/app/api/marketing/consent/route';

const NOW = Date.UTC(2026, 9, 26);
const DAY = 86_400_000;
const both = { analytics: true, marketing: true };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.eventsEnabled = true;
  mocks.attributionUpdateMany.mockResolvedValue({ count: 1 });
  mocks.deliveryUpdateMany.mockResolvedValue({ count: 2 });
});

describe('unattributed is not organic and not direct by default', () => {
  it('a booking with consent but no recorded visit is unknown', () => {
    const r = resolveAttribution({ cookie: null, consent: both, lookbackDays: 30, now: NOW });
    expect(r.channel).toBe('unknown');
    expect(channelGroup(r.channel)).toBe('unknown');
  });

  it('a recorded direct first visit is direct', () => {
    const c = mergeTouch(null, directLanding('https://gilifast.com/', NOW - DAY));
    expect(resolveAttribution({ cookie: c, consent: both, lookbackDays: 30, now: NOW }).channel).toBe('direct');
  });

  it('a direct landing never overwrites an earlier campaign touch', () => {
    const google = touchFromLanding({ url: 'https://gilifast.com/?gclid=G', allowClickIds: true, now: NOW - 2 * DAY })!;
    const c = mergeTouch(mergeTouch(null, google), directLanding('https://gilifast.com/b/X', NOW - DAY));
    expect(c?.lt?.gclid).toBe('G');
    expect(resolveAttribution({ cookie: c, consent: both, lookbackDays: 30, now: NOW }).channel).toBe('google_ads');
  });

  it('a campaign touch older than the lookback falls back to direct, not to the campaign', () => {
    const google = touchFromLanding({ url: 'https://gilifast.com/?gclid=G', allowClickIds: true, now: NOW - 40 * DAY })!;
    const r = resolveAttribution({ cookie: mergeTouch(null, google), consent: both, lookbackDays: 30, now: NOW });
    expect(r.channel).toBe('direct');
    expect(r.platform).toBeNull();
  });

  it('groups channels into paid, non-paid, direct, unknown and consent unavailable', () => {
    expect(channelGroup('google_ads')).toBe('attributed_paid');
    expect(channelGroup('meta_ads')).toBe('attributed_paid');
    expect(channelGroup('organic_search')).toBe('attributed_non_paid');
    expect(channelGroup('direct')).toBe('direct');
    expect(channelGroup('consent_unavailable')).toBe('consent_unavailable');
    expect(channelGroup(null)).toBe('unknown');
    expect(classifyTouch(null)).toBe('unknown');
  });
});

describe('consent withdrawal after booking', () => {
  it('narrows but never widens the booking-time consent', () => {
    expect(effectiveConsent({ analytics: true, marketing: true }, { consentAnalytics: true, consentMarketing: false, consentWithdrawnAt: null })).toEqual({
      analytics: true,
      marketing: false,
      withdrawn: false,
    });
    expect(effectiveConsent({ analytics: false, marketing: false }, { consentAnalytics: true, consentMarketing: true, consentWithdrawnAt: null })).toEqual({
      analytics: false,
      marketing: false,
      withdrawn: false,
    });
    expect(effectiveConsent({ analytics: true, marketing: true }, { consentAnalytics: true, consentMarketing: true, consentWithdrawnAt: new Date() }).withdrawn).toBe(true);
  });

  it('withdrawing marketing wipes ad identifiers and skips queued ad deliveries for that visitor', async () => {
    mocks.attributionFindMany.mockResolvedValue([{ bookingId: 'b1' }, { bookingId: 'b2' }]);
    const out = await withdrawConsentForVisitor('v_0123456789abcdef0123', { analytics: false, marketing: true });
    expect(out).toEqual({ attributions: 1, deliveriesSkipped: 2 });
    const data = (mocks.attributionUpdateMany.mock.calls[0] as unknown as [{ data: Record<string, unknown> }])[0].data;
    expect(data).toMatchObject({ consentMarketing: false, gclid: null, fbc: null, clientIpAddress: null });
    expect(data).not.toHaveProperty('consentAnalytics');
    expect(data).not.toHaveProperty('consentWithdrawnAt');
    expect(mocks.deliveryUpdateMany).toHaveBeenCalledWith({
      where: { status: { in: ['PENDING', 'FAILED'] }, destination: { in: ['GOOGLE_ADS', 'META_CAPI'] }, event: { bookingId: { in: ['b1', 'b2'] } } },
      data: { status: 'SKIPPED', skipReason: 'CONSENT_WITHDRAWN' },
    });
  });

  it('ignores malformed visitor ids and empty withdrawals', async () => {
    expect(await withdrawConsentForVisitor('nope', { analytics: true, marketing: true })).toEqual({ attributions: 0, deliveriesSkipped: 0 });
    expect(await withdrawConsentForVisitor('v_0123456789abcdef0123', { analytics: false, marketing: false })).toEqual({ attributions: 0, deliveriesSkipped: 0 });
    expect(mocks.attributionFindMany).not.toHaveBeenCalled();
  });

  it('admin withdrawal by booking is full and audited', async () => {
    await withdrawConsentForBooking('b9', 'adm1');
    const data = (mocks.attributionUpdateMany.mock.calls[0] as unknown as [{ data: Record<string, unknown> }])[0].data;
    expect(data.consentWithdrawnAt).toBeInstanceOf(Date);
    expect(mocks.auditCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'marketing_consent_withdrawn', userId: 'adm1' }) }));
  });

  it('the public endpoint only ever withdraws and validates its input', async () => {
    mocks.attributionFindMany.mockResolvedValue([{ bookingId: 'b1' }]);
    const req = (body: unknown) => new NextRequest('http://localhost/api/marketing/consent', { method: 'POST', body: JSON.stringify(body) });
    expect((await consentRoute(req({ visitorId: 'v_0123456789abcdef0123', withdraw: { analytics: false, marketing: true } }))).status).toBe(200);
    expect((await consentRoute(req({ visitorId: 'v_0123456789abcdef0123', grant: { marketing: true } }))).status).toBe(400);
    expect((await consentRoute(req({ visitorId: 'x', withdraw: { analytics: true, marketing: true } }))).status).toBe(400);
  });
});
