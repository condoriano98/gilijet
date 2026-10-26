import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';

const mocks = vi.hoisted(() => ({
  env: {} as Record<string, unknown>,
  delivery: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    updateMany: vi.fn(),
    update: vi.fn(),
  },
  attributionFind: vi.fn(),
  attributionUpdateMany: vi.fn(),
  deliveryEnabled: true,
}));

vi.mock('@/shared/server/env', () => ({ env: mocks.env }));
vi.mock('@/shared/server/db', () => ({
  prisma: {
    marketingEventDelivery: mocks.delivery,
    bookingAttribution: { findUnique: mocks.attributionFind, updateMany: mocks.attributionUpdateMany },
  },
}));
vi.mock('@/features/marketing/config', () => ({
  deliveryEnabled: () => mocks.deliveryEnabled,
  isProductionEnvironment: () => false,
  marketingEnvironment: () => 'staging',
}));

import { buildGa4Payload, decideGa4, sendGa4 } from '@/features/marketing/delivery/ga4';
import { buildMetaPayload, decideMeta } from '@/features/marketing/delivery/meta-capi';
import { buildDataManagerPayload, decideGoogleAds } from '@/features/marketing/delivery/google-ads';
import { processDueDeliveries, replayDelivery, nextAttemptDelayMs, MAX_ATTEMPTS } from '@/features/marketing/delivery/dispatcher';
import type { DeliveryContext } from '@/features/marketing/delivery/types';

const NOW = new Date('2026-10-26T04:00:00Z');

function event(over: Partial<DeliveryContext['event']> = {}): DeliveryContext['event'] {
  return {
    eventId: 'purchase_bk1',
    eventName: 'purchase',
    occurredAt: new Date('2026-10-26T03:00:00Z'),
    bookingId: 'bk1',
    routeCode: 'PDB-GTA',
    legId: 'leg1',
    passengerCount: 2,
    currency: 'IDR',
    value: new Prisma.Decimal('900000'),
    consent: { analytics: true, marketing: true, decided: true },
    environment: 'staging',
    ...over,
  };
}

function attribution(over: Partial<NonNullable<DeliveryContext['attribution']>> = {}): NonNullable<DeliveryContext['attribution']> {
  return {
    consentAnalytics: true,
    consentMarketing: true,
    gclid: 'Cj0KCQ',
    gbraid: null,
    wbraid: 'WB1',
    fbc: 'fb.1.1761440000000.IwAR',
    fbp: 'fb.1.1761440000000.123',
    gaClientId: '1234.5678',
    gaSessionId: '1761470000',
    clientIpAddress: '203.0.113.9',
    clientUserAgent: 'Mozilla/5.0',
    landingPath: '/?utm_source=google',
    lastTouchAt: new Date('2026-10-20T00:00:00Z'),
    ...over,
  };
}

const ctx = (over: Partial<DeliveryContext> = {}): DeliveryContext => {
  const ev = over.event ?? event();
  const snap = ev.consent as { analytics: boolean; marketing: boolean };
  return {
    event: ev,
    attribution: attribution(),
    consent: { analytics: snap.analytics, marketing: snap.marketing, withdrawn: false },
    now: NOW,
    isProduction: false,
    appBaseUrl: 'https://gilijet.vercel.app',
    ...over,
  };
};

function configureAll() {
  Object.assign(mocks.env, {
    GA4_MEASUREMENT_ID: 'G-TEST',
    GA4_API_SECRET: 'secret',
    META_PIXEL_ID: '111',
    META_CAPI_ACCESS_TOKEN: 'EAAtoken',
    META_TEST_EVENT_CODE: 'TEST123',
    GOOGLE_ADS_CLIENT_ID: 'cid',
    GOOGLE_ADS_CLIENT_SECRET: 'cs',
    GOOGLE_ADS_REFRESH_TOKEN: 'rt',
    GOOGLE_ADS_CUSTOMER_ID: '1234567890',
    GOOGLE_ADS_PURCHASE_CONVERSION_ACTION_ID: '987',
    APP_BASE_URL: 'https://gilijet.vercel.app',
    MARKETING_MATCH_RETENTION_DAYS: 90,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(mocks.env)) delete mocks.env[k];
  mocks.deliveryEnabled = true;
  configureAll();
});

describe('delivery decisions', () => {
  it('sends a consented, matched, fresh purchase to all three', () => {
    expect(decideGa4(ctx())).toEqual({ action: 'send' });
    expect(decideMeta(ctx())).toEqual({ action: 'send' });
    expect(decideGoogleAds(ctx())).toEqual({ action: 'send' });
  });

  it('blocks ad platforms without marketing consent while GA4 follows analytics consent', () => {
    const c = ctx({ event: event({ consent: { analytics: true, marketing: false, decided: true } }) });
    expect(decideMeta(c)).toEqual({ action: 'skip', reason: 'NO_CONSENT' });
    expect(decideGoogleAds(c)).toEqual({ action: 'skip', reason: 'NO_CONSENT' });
    expect(decideGa4(c)).toEqual({ action: 'send' });
    const none = ctx({ event: event({ consent: { analytics: false, marketing: false, decided: true } }) });
    expect(decideGa4(none)).toEqual({ action: 'skip', reason: 'NO_CONSENT' });
  });

  it('reports missing match data honestly instead of sending a blind conversion', () => {
    const c = ctx({ attribution: attribution({ gclid: null, gbraid: null, wbraid: null, clientUserAgent: null, gaClientId: null }) });
    expect(decideGoogleAds(c)).toEqual({ action: 'skip', reason: 'NO_MATCH_DATA' });
    expect(decideMeta(c)).toEqual({ action: 'skip', reason: 'NO_MATCH_DATA' });
    expect(decideGa4(c)).toEqual({ action: 'skip', reason: 'NO_MATCH_DATA' });
    expect(decideMeta(ctx({ attribution: null }))).toEqual({ action: 'skip', reason: 'NO_MATCH_DATA' });
  });

  it('skips when credentials are absent', () => {
    delete mocks.env.META_CAPI_ACCESS_TOKEN;
    delete mocks.env.GOOGLE_ADS_PURCHASE_CONVERSION_ACTION_ID;
    expect(decideMeta(ctx())).toEqual({ action: 'skip', reason: 'NOT_CONFIGURED' });
    expect(decideGoogleAds(ctx())).toEqual({ action: 'skip', reason: 'NOT_CONFIGURED' });
  });

  it('respects provider age limits', () => {
    const old = ctx({ now: new Date('2026-11-05T00:00:00Z') });
    expect(decideGa4(old)).toEqual({ action: 'skip', reason: 'TOO_OLD' });
    expect(decideMeta(old)).toEqual({ action: 'skip', reason: 'TOO_OLD' });
  });

  it('only sends purchase (and GA4 refund)', () => {
    const refund = ctx({ event: event({ eventName: 'refund', eventId: 'refund_rf1' }) });
    expect(decideGa4(refund)).toEqual({ action: 'send' });
    expect(decideMeta(refund)).toEqual({ action: 'skip', reason: 'UNSUPPORTED_EVENT' });
    expect(decideGoogleAds(refund)).toEqual({ action: 'skip', reason: 'UNSUPPORTED_EVENT' });
  });
});

describe('payloads', () => {
  it('Meta CAPI reuses the stored event id, sends Purchase, and uses the test code only outside production', () => {
    const p = buildMetaPayload(ctx()) as { data: Array<Record<string, unknown>>; test_event_code?: string };
    expect(p.data[0]).toMatchObject({
      event_name: 'Purchase',
      event_id: 'purchase_bk1',
      action_source: 'website',
      event_source_url: 'https://gilijet.vercel.app/',
      custom_data: { value: 900000, currency: 'IDR', order_id: 'bk1' },
    });
    expect(p.test_event_code).toBe('TEST123');
    expect((buildMetaPayload(ctx({ isProduction: true })) as { test_event_code?: string }).test_event_code).toBeUndefined();
    expect(JSON.stringify(p)).not.toMatch(/@|customerName|passport/);
  });

  it('Data Manager sends exactly one click id, the booking id as transaction id, and validateOnly off-production', () => {
    const p = buildDataManagerPayload(ctx());
    expect(p.events[0].adIdentifiers).toEqual({ gclid: 'Cj0KCQ' });
    expect(p.events[0].transactionId).toBe('bk1');
    expect(p.events[0].conversionValue).toBe(900000);
    expect(p.validateOnly).toBe(true);
    expect(buildDataManagerPayload(ctx({ isProduction: true })).validateOnly).toBe(false);
    const braid = buildDataManagerPayload(ctx({ attribution: attribution({ gclid: null, gbraid: 'GB', wbraid: 'WB' }) }));
    expect(braid.events[0].adIdentifiers).toEqual({ gbraid: 'GB' });
  });

  it('GA4 uses the booking id as transaction_id and carries consent', () => {
    const p = buildGa4Payload(ctx());
    expect(p.client_id).toBe('1234.5678');
    expect(p.events[0].params).toMatchObject({ transaction_id: 'bk1', value: 900000, currency: 'IDR', session_id: '1761470000' });
    expect(p.consent).toEqual({ ad_user_data: 'GRANTED', ad_personalization: 'GRANTED' });
  });

  it('GA4 uses the validation endpoint outside production and treats validation messages as permanent', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ validationMessages: [{ description: 'bad param' }] }), { status: 200 }));
    await expect(sendGa4(ctx(), fetchImpl as unknown as typeof fetch)).rejects.toThrow('ga4 validation: bad param');
    expect(String((fetchImpl.mock.calls[0] as unknown[])[0])).toContain('/debug/mp/collect');
  });
});

describe('dispatcher', () => {
  const row = (over: Record<string, unknown> = {}) => ({
    id: 'd1',
    destination: 'META_CAPI',
    attempts: 1,
    event: event(),
    ...over,
  });

  beforeEach(() => {
    mocks.delivery.findMany.mockResolvedValue([{ id: 'd1', status: 'PENDING', lastAttemptAt: null }]);
    mocks.delivery.updateMany.mockResolvedValue({ count: 1 });
    mocks.delivery.update.mockResolvedValue({});
    mocks.attributionFind.mockResolvedValue({ ...attribution(), consentWithdrawnAt: null });
  });

  it('marks a successful send DELIVERED', async () => {
    mocks.delivery.findUnique.mockResolvedValue(row());
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ events_received: 1 }), { status: 200 }));
    const s = await processDueDeliveries({ fetchImpl: fetchImpl as unknown as typeof fetch, now: NOW });
    expect(s.delivered).toBe(1);
    expect(mocks.delivery.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'DELIVERED' }) }));
    const body = JSON.parse(String(((fetchImpl.mock.calls[0] as unknown[])[1] as RequestInit).body));
    expect(body.data[0].event_id).toBe('purchase_bk1');
    // The token travels in a header, never in the stored error or the URL.
    expect(String((fetchImpl.mock.calls[0] as unknown[])[0])).not.toContain('EAAtoken');
  });

  it('keeps a provider outage retryable with backoff and never throws', async () => {
    mocks.delivery.findUnique.mockResolvedValue(row());
    const fetchImpl = vi.fn(async () => new Response('upstream down access_token=EAAsecret123456789012345', { status: 503 }));
    const s = await processDueDeliveries({ fetchImpl: fetchImpl as unknown as typeof fetch, now: NOW });
    expect(s.retrying).toBe(1);
    const data = (mocks.delivery.update.mock.calls[0] as unknown as [{ data: { status: string; nextAttemptAt: Date; lastError: string } }])[0].data;
    expect(data.status).toBe('PENDING');
    expect(data.nextAttemptAt.getTime()).toBe(NOW.getTime() + nextAttemptDelayMs(1));
    expect(data.lastError).not.toContain('EAAsecret');
  });

  it('gives up after the attempt budget and on permanent errors', async () => {
    mocks.delivery.findUnique.mockResolvedValue(row({ attempts: MAX_ATTEMPTS }));
    const fetchImpl = vi.fn(async () => new Response('down', { status: 500 }));
    const s = await processDueDeliveries({ fetchImpl: fetchImpl as unknown as typeof fetch, now: NOW });
    expect(s.failed).toBe(1);
    mocks.delivery.findUnique.mockResolvedValue(row());
    const bad = vi.fn(async () => new Response('{"error":"invalid"}', { status: 400 }));
    const s2 = await processDueDeliveries({ fetchImpl: bad as unknown as typeof fetch, now: NOW });
    expect(s2.failed).toBe(1);
  });

  it('records a consent skip without calling the provider', async () => {
    mocks.delivery.findUnique.mockResolvedValue(row({ event: event({ consent: { analytics: true, marketing: false, decided: true } }) }));
    const fetchImpl = vi.fn();
    const s = await processDueDeliveries({ fetchImpl: fetchImpl as unknown as typeof fetch, now: NOW });
    expect(s.skipped).toBe(1);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(mocks.delivery.update).toHaveBeenCalledWith({ where: { id: 'd1' }, data: { status: 'SKIPPED', skipReason: 'NO_CONSENT' } });
  });

  it('consent withdrawn after booking blocks the send, including a replayed row', async () => {
    mocks.delivery.findUnique.mockResolvedValue(row());
    mocks.attributionFind.mockResolvedValue({ ...attribution(), consentWithdrawnAt: new Date('2026-10-26T03:30:00Z') });
    const fetchImpl = vi.fn();
    const s = await processDueDeliveries({ fetchImpl: fetchImpl as unknown as typeof fetch, now: NOW });
    expect(s.skipped).toBe(1);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(mocks.delivery.update).toHaveBeenCalledWith({ where: { id: 'd1' }, data: { status: 'SKIPPED', skipReason: 'CONSENT_WITHDRAWN' } });
  });

  it('a withdrawn marketing flag narrows the booking-time consent without widening analytics', async () => {
    mocks.delivery.findUnique.mockResolvedValue(row({ destination: 'GOOGLE_ADS' }));
    mocks.attributionFind.mockResolvedValue({ ...attribution(), consentMarketing: false, consentWithdrawnAt: null });
    const s = await processDueDeliveries({ fetchImpl: vi.fn() as unknown as typeof fetch, now: NOW });
    expect(s.skipped).toBe(1);
  });

  it('reclaims a stuck row with compare-and-set on lastAttemptAt so two workers cannot both take it', async () => {
    const stuckAt = new Date('2026-10-26T03:40:00Z');
    mocks.delivery.findMany.mockResolvedValue([{ id: 'd1', status: 'PROCESSING', lastAttemptAt: stuckAt }]);
    mocks.delivery.updateMany.mockResolvedValue({ count: 0 });
    await processDueDeliveries({ fetchImpl: vi.fn() as unknown as typeof fetch, now: NOW });
    expect(mocks.delivery.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'd1', status: 'PROCESSING', lastAttemptAt: stuckAt } }),
    );
  });

  it('does not send a row another run already claimed', async () => {
    mocks.delivery.updateMany.mockResolvedValue({ count: 0 });
    const fetchImpl = vi.fn();
    const s = await processDueDeliveries({ fetchImpl: fetchImpl as unknown as typeof fetch, now: NOW });
    expect(s.claimed).toBe(0);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('never sends an event recorded in another environment', async () => {
    mocks.delivery.findUnique.mockResolvedValue(row({ event: event({ environment: 'production' }) }));
    const fetchImpl = vi.fn();
    const s = await processDueDeliveries({ fetchImpl: fetchImpl as unknown as typeof fetch, now: NOW });
    expect(s.skipped).toBe(1);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('does nothing while delivery is switched off', async () => {
    mocks.deliveryEnabled = false;
    const s = await processDueDeliveries({ now: NOW });
    expect(s.claimed).toBe(0);
    expect(mocks.delivery.findMany).not.toHaveBeenCalled();
  });

  it('replays only failed or skipped rows, resetting the budget but not the event id', async () => {
    mocks.delivery.updateMany.mockResolvedValue({ count: 1 });
    expect(await replayDelivery('d1')).toBe(true);
    expect(mocks.delivery.updateMany).toHaveBeenCalledWith({
      where: { id: 'd1', status: { in: ['FAILED', 'SKIPPED'] } },
      data: expect.objectContaining({ status: 'PENDING', attempts: 0 }),
    });
  });
});
