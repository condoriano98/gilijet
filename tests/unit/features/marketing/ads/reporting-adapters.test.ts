import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  env: {} as Record<string, unknown>,
  session: null as null | { sub: string; adminRole: 'SUPER_ADMIN' | 'STAFF' },
  syncEnabled: false,
}));

vi.mock('@/shared/server/env', () => ({ env: mocks.env }));
vi.mock('@/shared/server/db', () => ({ prisma: {} }));
vi.mock('@/shared/server/auth', () => ({ getAdminSession: async () => mocks.session }));
vi.mock('@/features/marketing/google-auth', () => ({ googleAccessToken: async () => 'ya29.secret-token' }));

import { buildCampaignSpendQuery, fetchGoogleAdsSpend, mapGoogleRows } from '@/features/marketing/ads/google-ads-reporting';
import { fetchMetaSpend, pickPurchase } from '@/features/marketing/ads/meta-reporting';
import { summarizeSpend, spendInputFor, reachRows, type StoredSpendRow } from '@/features/marketing/reporting/spend';
import { allocateCampaignSpend, type RouteMapping } from '@/features/marketing/reporting/route-allocation';
import { groupByAcquisitionDate, periodBasis } from '@/features/marketing/reporting/time-models';
import { buildAcquisitionView, buildExecutiveOverview, buildFunnelView, buildRouteOperatorRows, type AttributedBooking } from '@/features/marketing/reporting/contracts';
import { computeBookingFinancials, summarizeFinancials } from '@/features/marketing/reporting/financials';
import { superAdminOrResponse } from '@/features/marketing/admin-api';
import { GET as templateRoute } from '@/app/api/admin/marketing/spend-template/route';
import { POST as importRoute } from '@/app/api/admin/marketing/spend-import/route';
import { GET as reconcileRoute } from '@/app/api/admin/marketing/reconciliation/route';

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

beforeEach(() => {
  for (const k of Object.keys(mocks.env)) delete mocks.env[k];
  mocks.session = null;
});

describe('Google Ads reporting adapter', () => {
  it('builds a campaign-level GAQL query and refuses malformed dates', () => {
    expect(buildCampaignSpendQuery('2026-10-01', '2026-10-07')).toContain("FROM campaign WHERE segments.date BETWEEN '2026-10-01' AND '2026-10-07'");
    expect(() => buildCampaignSpendQuery("2026-10-01' OR '1'='1", '2026-10-07')).toThrow();
  });

  it('converts cost micros with Decimal precision and keeps the account currency', () => {
    const [r] = mapGoogleRows([
      { results: [{ customer: { id: '123', timeZone: 'America/New_York', currencyCode: 'USD' }, campaign: { id: '9', name: 'Gili' }, segments: { date: '2026-10-20' }, metrics: { costMicros: '1234567891', impressions: '10', clicks: '2', conversions: 1.5, conversionsValue: 99.9 } }] },
    ]);
    expect(r.spend.toString()).toBe('1234.57');
    expect(r).toMatchObject({ currency: 'USD', accountTimezone: 'America/New_York', level: 'CAMPAIGN', impressions: 10, reportDateBasis: 'click' });
    expect(r.platformPurchases!.toString()).toBe('1.5');
  });

  it('marks HTTP errors and stream errors incomplete without leaking the token', async () => {
    mocks.env.GOOGLE_ADS_CUSTOMER_ID = '123';
    const fail = vi.fn(async () => new Response('{"error":"PERMISSION_DENIED access_token=ya29.secret-token"}', { status: 403 }));
    const d = await fetchGoogleAdsSpend({ from: '2026-10-20', to: '2026-10-20', fetchImpl: fail as unknown as typeof fetch });
    expect(d.complete).toBe(false);
    expect(d.incompleteReason).not.toContain('ya29.secret-token');
    const partial = vi.fn(async () => new Response(JSON.stringify([{ results: [] }, { error: { code: 13 } }]), { status: 200 }));
    expect((await fetchGoogleAdsSpend({ from: '2026-10-20', to: '2026-10-20', fetchImpl: partial as unknown as typeof fetch })).incompleteReason).toBe('STREAM_ERROR');
    const headers = ((fail.mock.calls[0] as unknown[])[1] as RequestInit).headers as Record<string, string>;
    expect(headers).not.toHaveProperty('developer-token');
  });
});

describe('Meta reporting adapter', () => {
  beforeEach(() => {
    Object.assign(mocks.env, { META_AD_ACCOUNT_ID: 'act_777', META_ADS_ACCESS_TOKEN: 'EAAtoken123456789012345' });
  });

  it('follows pagination, uses the account currency and timezone, and stores reach apart', async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (url: string) => {
      calls.push(url);
      if (!url.includes('/insights')) return new Response(JSON.stringify({ currency: 'USD', timezone_name: 'Asia/Singapore' }));
      if (url.includes('level=campaign')) return new Response(JSON.stringify({ data: [{ date_start: '2026-10-20', campaign_id: 'c1', reach: '900', frequency: '1.4' }] }));
      if (url.includes('after=p2')) return new Response(JSON.stringify({ data: [{ date_start: '2026-10-20', campaign_id: 'c1', adset_id: 's1', ad_id: 'a2', spend: '0.10' }] }));
      return new Response(JSON.stringify({ data: [{ date_start: '2026-10-20', campaign_id: 'c1', adset_id: 's1', ad_id: 'a1', spend: '0.20', actions: [{ action_type: 'purchase', value: '2' }] }], paging: { next: 'https://graph.facebook.com/v26.0/act_777/insights?after=p2' } }));
    });
    const d = await fetchMetaSpend({ from: '2026-10-20', to: '2026-10-20', fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(d.complete).toBe(true);
    expect(d.records).toHaveLength(2);
    expect(d.records.reduce((a, r) => a.add(r.spend), D(0)).toString()).toBe('0.3');
    expect(d.records[0]).toMatchObject({ currency: 'USD', accountTimezone: 'Asia/Singapore', level: 'AD', accountId: '777' });
    expect(d.reach).toEqual([{ platform: 'META_ADS', accountId: '777', date: '2026-10-20', campaignId: 'c1', reach: 900, frequency: D('1.4') }]);
    expect(calls.every((u) => !u.includes('EAAtoken'))).toBe(true);
  });

  it('prefers omni_purchase and returns null when no purchase action is reported', () => {
    expect(pickPurchase([{ action_type: 'purchase', value: '3' }, { action_type: 'omni_purchase', value: '4' }])!.toString()).toBe('4');
    expect(pickPurchase([{ action_type: 'link_click', value: '9' }])).toBeNull();
  });

  it('an API error makes the delivery incomplete', async () => {
    const fetchImpl = vi.fn(async (url: string) =>
      url.includes('/insights') ? new Response(JSON.stringify({ error: { message: 'rate limited' } }), { status: 400 }) : new Response(JSON.stringify({ currency: 'IDR', timezone_name: 'Asia/Makassar' })),
    );
    const d = await fetchMetaSpend({ from: '2026-10-20', to: '2026-10-20', fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(d.complete).toBe(false);
  });
});

describe('spend summary', () => {
  const row = (over: Partial<StoredSpendRow> = {}): StoredSpendRow => ({
    platform: 'META_ADS',
    accountId: '777',
    date: '2026-10-20',
    accountTimezone: 'Asia/Makassar',
    currency: 'IDR',
    level: 'AD',
    campaignId: 'c1',
    campaignName: null,
    spend: D('100'),
    impressions: 10,
    clicks: 1,
    platformPurchases: null,
    platformPurchaseValue: null,
    ...over,
  });

  it('never sums currencies and reports days without data as gaps, not zero', () => {
    const s = summarizeSpend({
      rows: [row(), row({ platform: 'GOOGLE_ADS', accountId: '123', currency: 'USD', spend: D('5') })],
      from: '2026-10-20',
      to: '2026-10-21',
      expectedAccounts: [],
      confirmedEmpty: new Set(['META_ADS|777|2026-10-21']),
    });
    expect(s.byCurrency.IDR.toString()).toBe('100');
    expect(s.byCurrency.USD.toString()).toBe('5');
    expect(s.missingAccountDays).toEqual(['GOOGLE_ADS|123|2026-10-21']);
    expect(s.status).toBe('partial');
    const input = spendInputFor(s, 'IDR');
    expect(input.status).toBe('partial');
    expect(input.reasons).toEqual(expect.arrayContaining(['1_ACCOUNT_DAYS_WITHOUT_SPEND_DATA', 'SPEND_IN_OTHER_CURRENCIES_EXCLUDED_USD']));
  });

  it('is unavailable when no account has ever reported', () => {
    const s = summarizeSpend({ rows: [], from: '2026-10-20', to: '2026-10-20', expectedAccounts: [], confirmedEmpty: new Set() });
    expect(spendInputFor(s, 'IDR').status).toBe('unavailable');
  });

  it('offers reach row by row and marks it non-additive', () => {
    expect(reachRows([]).additive).toBe(false);
  });
});

describe('campaign-to-route allocation', () => {
  const map = (over: Partial<RouteMapping>): RouteMapping => ({
    platform: 'META_ADS',
    accountId: '777',
    campaignId: 'c1',
    routeCode: 'PDB-GTA',
    method: 'DIRECT',
    allocationWeight: D(1),
    effectiveFrom: '2026-10-01',
    effectiveTo: null,
    ...over,
  });
  const spend = (campaignId: string, amount: string) => ({ platform: 'META_ADS' as const, accountId: '777', campaignId, date: '2026-10-20', currency: 'IDR', spend: D(amount) });

  it('keeps direct, allocated (labelled estimate) and unallocated spend apart and conserves the total', () => {
    const r = allocateCampaignSpend(
      [spend('c1', '1000'), spend('c2', '1000'), spend('c3', '500')],
      [
        map({}),
        map({ campaignId: 'c2', method: 'ALLOCATED', routeCode: 'PDB-GTA', allocationWeight: D('0.6') }),
        map({ campaignId: 'c2', method: 'ALLOCATED', routeCode: 'GTA-PDB', allocationWeight: D('0.3') }),
      ],
    );
    const pdb = r.routes.find((x) => x.routeCode === 'PDB-GTA')!;
    expect(pdb.direct.toString()).toBe('1000');
    expect(pdb.allocated.toString()).toBe('600');
    expect(pdb.allocatedIsEstimate).toBe(true);
    expect(r.unallocated[0].spend.toString()).toBe('600');
    const total = r.routes.reduce((a, x) => a.add(x.direct).add(x.allocated), D(0)).add(r.unallocated[0].spend);
    expect(total.toString()).toBe('2500');
  });

  it('leaves spend unallocated under an invalid mapping instead of guessing', () => {
    const r = allocateCampaignSpend(
      [spend('c1', '100')],
      [map({ method: 'ALLOCATED', allocationWeight: D('0.7') }), map({ method: 'ALLOCATED', routeCode: 'X-Y', allocationWeight: D('0.7') })],
    );
    expect(r.invalidMappings[0].reason).toBe('WEIGHTS_INVALID');
    expect(r.routes).toHaveLength(0);
    expect(r.unallocated[0].spend.toString()).toBe('100');
  });

  it('respects effective dates', () => {
    const r = allocateCampaignSpend([spend('c1', '100')], [map({ effectiveFrom: '2026-11-01' })]);
    expect(r.unallocated[0].spend.toString()).toBe('100');
  });
});

describe('time models and dashboard contracts', () => {
  const fin = (id: string, over: Record<string, unknown> = {}) =>
    computeBookingFinancials({
      bookingId: id,
      currency: 'IDR',
      status: 'CONFIRMED',
      totalAmount: D('1000000'),
      commissionAmount: D('80000'),
      agentCommissionAmount: null,
      ticketCount: 1,
      payment: { status: 'SUCCESSFUL', paidAt: new Date('2026-10-20T03:00:00Z'), amount: D('1000000'), gatewayProvider: 'PAYPAL', gatewayFee: D('30000') },
      refund: null,
      ...over,
    });
  const attributed = (id: string, channel: string | null, over: Partial<AttributedBooking> = {}): AttributedBooking => ({
    financials: fin(id),
    channel,
    platform: null,
    campaignId: null,
    routeCode: 'PDB-GTA',
    operatorId: 'op1',
    status: 'CONFIRMED',
    ...over,
  });

  it('places bookings by touch date and counts the rest as uncovered', () => {
    const g = groupByAcquisitionDate(
      [
        { bookingId: 'a', lastTouchAt: new Date('2026-10-18T20:00:00Z'), payload: 1 },
        { bookingId: 'b', lastTouchAt: null, payload: 2 },
      ],
      'Asia/Jakarta',
    );
    expect(g.cohorts).toEqual({ '2026-10-19': [1] });
    expect(g.uncovered).toBe(1);
    expect(g.coverage).toBe(0.5);
    expect(periodBasis('Asia/Jakarta', ['America/New_York']).caveats.join(' ')).toMatch(/ad-account local/);
  });

  it('composes the executive overview from the financial contract and spend', () => {
    const f = summarizeFinancials([fin('a'), fin('b')]);
    const o = buildExecutiveOverview(periodBasis('Asia/Jakarta', []), f, { status: 'complete', amount: D('100000'), currency: 'IDR', reasons: [] });
    expect(o.paidBookingCpa).toEqual({ status: 'ok', value: D('50000') });
    expect(o.netMarketingContribution).toEqual({ status: 'ok', value: D('0') });
    expect(o.grossBookingValue.toString()).toBe('2000000');
    expect(o.retainedCommission.known.toString()).toBe('160000');
  });

  it('keeps unattributed bookings out of organic and reports attribution coverage', () => {
    const v = buildAcquisitionView([attributed('a', 'google_ads'), attributed('b', 'organic_search'), attributed('c', null), attributed('d', 'consent_unavailable')]);
    expect(v.unattributedPaidBookings).toBe(1);
    expect(v.consentUnavailablePaidBookings).toBe(1);
    expect(v.attributionCoverage).toEqual({ status: 'ok', value: D('0.5') });
    const organic = v.rows.find((r) => r.channel === 'organic_search')!;
    expect(organic.summary.paidBookings).toBe(1);
    expect(v.rows.find((r) => r.channel === 'unknown')!.group).toBe('unknown');
  });

  it('labels consent-gated funnel steps', () => {
    const f = buildFunnelView({ search: 10, purchase: 2 });
    expect(f.steps.find((s) => s.step === 'search')).toEqual({ step: 'search', events: 10, consentGated: true });
    expect(f.steps.find((s) => s.step === 'purchase')!.consentGated).toBe(false);
  });

  it('computes operator rejection only over decided bookings', () => {
    const rows = buildRouteOperatorRows(
      [
        attributed('a', null),
        attributed('b', null, { status: 'CANCELLED_BY_OPERATOR', financials: fin('b', { status: 'CANCELLED_BY_OPERATOR', ticketCount: 0, refund: { status: 'COMPLETED', refundAmount: D('1000000'), originalAmount: D('1000000') } }) }),
        attributed('c', null, { status: 'AWAITING_CONFIRMATION', financials: fin('c', { status: 'AWAITING_CONFIRMATION', ticketCount: 0 }) }),
      ],
      'operator',
    );
    expect(rows[0].operatorRejectionRate).toEqual({ status: 'ok', value: D('0.5') });
  });
});

describe('SUPER_ADMIN-only marketing APIs', () => {
  it('answers 401 without a session and 403 for staff admins', async () => {
    expect(((await superAdminOrResponse()) as Response).status).toBe(401);
    mocks.session = { sub: 'staff', adminRole: 'STAFF' };
    expect(((await superAdminOrResponse()) as Response).status).toBe(403);
    expect((await templateRoute(new Request('http://localhost/api/admin/marketing/spend-template'))).status).toBe(403);
    expect((await importRoute(new NextRequest('http://localhost/api/admin/marketing/spend-import', { method: 'POST', body: 'x' }))).status).toBe(403);
    expect((await reconcileRoute(new NextRequest('http://localhost/api/admin/marketing/reconciliation?from=2026-10-01&to=2026-10-02'))).status).toBe(403);
  });

  it('lets a super admin download the template and refuses an invalid CSV without writing', async () => {
    mocks.session = { sub: 'boss', adminRole: 'SUPER_ADMIN' };
    const t = await templateRoute(new Request('http://localhost/api/admin/marketing/spend-template'));
    expect(t.status).toBe(200);
    expect(await t.text()).toMatch(/^platform,account_id,date/);
    const bad = await importRoute(new NextRequest('http://localhost/api/admin/marketing/spend-import', { method: 'POST', body: 'platform,spend\nmeta_ads,1' }));
    expect(bad.status).toBe(422);
    expect(await bad.json()).toMatchObject({ ok: false, written: false });
  });
});
