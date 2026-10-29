import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  refundFind: vi.fn(),
  refundUpdateMany: vi.fn(),
  auditCreate: vi.fn(async () => ({})),
  recordBookingEvent: vi.fn(async () => 'refund_rf1'),
  process: vi.fn(),
  purge: vi.fn(async () => 0),
  deliveryEnabled: true,
  eventsEnabled: true,
}));

vi.mock('@/shared/server/env', () => ({
  env: { CRON_SECRET: 'cron-secret', ATTRIBUTION_LOOKBACK_DAYS: 30 },
}));
vi.mock('@/shared/server/db', () => ({
  prisma: {
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        refund: { findUnique: mocks.refundFind, updateMany: mocks.refundUpdateMany },
        auditLog: { create: mocks.auditCreate },
      }),
  },
}));
vi.mock('@/features/marketing/events', () => ({ recordBookingEvent: mocks.recordBookingEvent }));
vi.mock('@/features/marketing/delivery/dispatcher', () => ({
  processDueDeliveries: mocks.process,
  purgeExpiredMatchData: mocks.purge,
}));
vi.mock('@/features/marketing/config', () => ({
  deliveryEnabled: () => mocks.deliveryEnabled,
  eventsEnabled: () => mocks.eventsEnabled,
}));

import { markRefundCompleted } from '@/features/refunds/refund-completion';
import { readBookingAttribution } from '@/features/marketing/booking-attribution';
import { serializeConsent } from '@/features/marketing/consent';
import { encodeAttributionCookie, touchFromLanding } from '@/features/marketing/attribution';
import { GET as deliverCron } from '@/app/api/cron/marketing-deliver/route';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.deliveryEnabled = true;
  mocks.eventsEnabled = true;
});

describe('markRefundCompleted', () => {
  const refund = (over: Record<string, unknown> = {}) => ({
    id: 'rf1',
    bookingId: 'bk1',
    status: 'APPROVED',
    reason: 'CUSTOMER_REQUEST',
    originalAmount: new Prisma.Decimal('1000000'),
    refundAmount: new Prisma.Decimal('500000'),
    ...over,
  });

  it('completes an approved partial refund and records a refund event tied to the original purchase', async () => {
    mocks.refundFind.mockResolvedValue(refund());
    mocks.refundUpdateMany.mockResolvedValue({ count: 1 });
    const out = await markRefundCompleted({ refundId: 'rf1', adminId: 'adm1' });
    expect(out).toEqual({ ok: true, alreadyCompleted: false });
    expect(mocks.recordBookingEvent).toHaveBeenCalledWith(
      expect.anything(),
      'refund',
      'bk1',
      expect.objectContaining({
        refundId: 'rf1',
        properties: expect.objectContaining({ original_transaction_id: 'purchase_bk1', partial: true, original_amount: 1000000 }),
      }),
    );
    const ev = (mocks.recordBookingEvent.mock.calls[0] as unknown as [unknown, string, string, { value: Prisma.Decimal }])[3];
    expect(ev.value.toString()).toBe('500000');
  });

  it('is idempotent and refuses refunds that were never approved', async () => {
    mocks.refundFind.mockResolvedValue(refund({ status: 'COMPLETED' }));
    expect(await markRefundCompleted({ refundId: 'rf1', adminId: 'a' })).toEqual({ ok: true, alreadyCompleted: true });
    mocks.refundFind.mockResolvedValue(refund({ status: 'PENDING' }));
    mocks.refundUpdateMany.mockResolvedValue({ count: 0 });
    expect(await markRefundCompleted({ refundId: 'rf1', adminId: 'a' })).toEqual({ ok: false, reason: 'NOT_APPROVED' });
    expect(mocks.recordBookingEvent).not.toHaveBeenCalled();
  });
});

describe('readBookingAttribution', () => {
  const NOW = Date.UTC(2026, 9, 26);
  const touch = touchFromLanding({ url: 'https://gilifast.com/?gclid=G1&utm_source=google&utm_medium=cpc', allowClickIds: true, now: NOW - 86400000 })!;
  const jar = (consent: { analytics: boolean; marketing: boolean }): Record<string, string> => ({
    gf_consent: serializeConsent(consent, NOW),
    gf_attr: encodeAttributionCookie({ v: 1, ft: touch, lt: touch }),
    gf_vid: 'v_abc123',
    _ga: 'GA1.1.111.222',
    _ga_ABC: 'GS2.1.s1761400000$o1',
    _fbp: 'fb.1.1761400000000.999',
  });

  it('reads nothing identifying without consent', () => {
    const cookies = jar({ analytics: false, marketing: false });
    const out = readBookingAttribution({ cookie: (n) => cookies[n], allCookieNames: Object.keys(cookies), userAgent: 'UA', ip: '1.2.3.4', now: NOW });
    expect(out.resolved.channel).toBe('consent_unavailable');
    expect(out).toMatchObject({ visitorId: null, gaClientId: null, fbp: null, fbc: null, clientIpAddress: null, clientUserAgent: null });
  });

  it('reads analytics ids with analytics consent only, ad identifiers only with marketing consent', () => {
    const cookies = jar({ analytics: true, marketing: false });
    const out = readBookingAttribution({ cookie: (n) => cookies[n], allCookieNames: Object.keys(cookies), userAgent: 'UA', ip: '1.2.3.4', now: NOW });
    expect(out.resolved.channel).toBe('google_ads');
    expect(out).toMatchObject({ visitorId: 'v_abc123', gaClientId: '111.222', gaSessionId: '1761400000', fbp: null, clientIpAddress: null });
    const full = jar({ analytics: true, marketing: true });
    const out2 = readBookingAttribution({ cookie: (n) => full[n], allCookieNames: Object.keys(full), userAgent: 'UA', ip: '1.2.3.4, 10.0.0.1', now: NOW });
    expect(out2).toMatchObject({ fbp: 'fb.1.1761400000000.999', clientIpAddress: '1.2.3.4', clientUserAgent: 'UA' });
  });
});

describe('/api/cron/marketing-deliver', () => {
  const req = (auth?: string) =>
    new NextRequest('http://localhost/api/cron/marketing-deliver', { headers: auth ? { authorization: auth } : {} });

  it('requires the cron secret', async () => {
    expect((await deliverCron(req())).status).toBe(401);
    expect((await deliverCron(req('Bearer wrong'))).status).toBe(401);
    expect(mocks.process).not.toHaveBeenCalled();
  });

  it('purges then delivers when enabled, and only purges when delivery is off', async () => {
    mocks.process.mockResolvedValue({ claimed: 1, delivered: 1, skipped: 0, failed: 0, retrying: 0 });
    const res = await deliverCron(req('Bearer cron-secret'));
    expect(await res.json()).toMatchObject({ ok: true, delivered: 1 });
    mocks.deliveryEnabled = false;
    const off = await deliverCron(req('Bearer cron-secret'));
    expect(await off.json()).toMatchObject({ ok: true, disabled: true });
    expect(mocks.purge).toHaveBeenCalledTimes(2);
  });
});
