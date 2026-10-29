import { prisma } from '@/shared/server/db';
import { env } from '@/shared/server/env';
import { computeBookingFinancials } from '@/features/marketing/reporting/financials';
import type { AttributedBooking } from '@/features/marketing/reporting/contracts';
import type { StoredSpendRow } from '@/features/marketing/reporting/spend';
import type { RouteMapping } from '@/features/marketing/reporting/route-allocation';

/**
 * Read-only loaders for the reporting contracts. Every query here is a read;
 * nothing in reporting writes the ledger.
 *
 * `basis` picks the booking clock: 'payment' (paidAt, the default for money
 * views) or 'created' (request cohorts, the default for the funnel).
 */
export async function loadAttributedBookings(range: { from: Date; to: Date; basis: 'payment' | 'created' }): Promise<AttributedBooking[]> {
  const where =
    range.basis === 'payment'
      ? { payment: { paidAt: { gte: range.from, lt: range.to } } }
      : { createdAt: { gte: range.from, lt: range.to } };
  const rows = await prisma.booking.findMany({
    where,
    select: {
      id: true,
      status: true,
      operatorId: true,
      currency: true,
      totalAmount: true,
      commissionAmount: true,
      agentCommissionAmount: true,
      tripType: true,
      _count: { select: { tickets: true } },
      payment: { select: { status: true, paidAt: true, amount: true, gatewayProvider: true, gatewayFee: true } },
      refund: { select: { status: true, refundAmount: true, originalAmount: true } },
      leg: { select: { schedule: { select: { originPort: true, destinationPort: true } } } },
      outboundLeg: { select: { schedule: { select: { originPort: true, destinationPort: true } } } },
    },
  });
  const attributions = await prisma.bookingAttribution.findMany({
    where: { bookingId: { in: rows.map((r) => r.id) } },
    select: { bookingId: true, channel: true, platform: true, campaignId: true },
  });
  const byBooking = new Map(attributions.map((a) => [a.bookingId, a]));
  return rows.map((b) => {
    const leg = b.tripType === 'ROUND_TRIP' ? b.outboundLeg : b.leg;
    const a = byBooking.get(b.id);
    return {
      financials: computeBookingFinancials({
        bookingId: b.id,
        currency: b.currency,
        status: b.status,
        totalAmount: b.totalAmount,
        commissionAmount: b.commissionAmount,
        agentCommissionAmount: b.agentCommissionAmount,
        ticketCount: b._count.tickets,
        payment: b.payment,
        refund: b.refund,
      }),
      channel: a?.channel ?? null,
      platform: a?.platform === 'google' || a?.platform === 'meta' ? a.platform : null,
      campaignId: a?.campaignId ?? null,
      routeCode: leg ? `${leg.schedule.originPort}-${leg.schedule.destinationPort}`.toUpperCase() : null,
      operatorId: b.operatorId,
      status: b.status,
    };
  });
}

export async function loadSpendRows(range: { from: string; to: string }): Promise<StoredSpendRow[]> {
  const rows = await prisma.adSpendDaily.findMany({
    where: { date: { gte: new Date(`${range.from}T00:00:00Z`), lte: new Date(`${range.to}T00:00:00Z`) } },
    select: {
      platform: true,
      accountId: true,
      date: true,
      accountTimezone: true,
      currency: true,
      level: true,
      campaignId: true,
      campaignName: true,
      spend: true,
      impressions: true,
      clicks: true,
      platformPurchases: true,
      platformPurchaseValue: true,
    },
  });
  return rows.map((r) => ({ ...r, date: r.date.toISOString().slice(0, 10) }));
}

/** account-days a complete API sync confirmed empty, from AdSyncRun reports. */
export async function loadConfirmedEmptyScopes(range: { from: string; to: string }): Promise<Set<string>> {
  const runs = await prisma.adSyncRun.findMany({
    where: { status: { in: ['SUCCEEDED', 'PARTIAL'] }, dateTo: { gte: new Date(`${range.from}T00:00:00Z`) }, dateFrom: { lte: new Date(`${range.to}T00:00:00Z`) } },
    select: { report: true },
  });
  const out = new Set<string>();
  for (const r of runs) {
    const cleared = (r.report as { scopesCleared?: string[] } | null)?.scopesCleared ?? [];
    cleared.forEach((s) => out.add(s));
  }
  return out;
}

/** Accounts expected to report: the configured ones. */
export function configuredAdAccounts(): Array<{ platform: 'GOOGLE_ADS' | 'META_ADS'; accountId: string }> {
  return [
    ...(env.GOOGLE_ADS_CUSTOMER_ID ? [{ platform: 'GOOGLE_ADS' as const, accountId: env.GOOGLE_ADS_CUSTOMER_ID }] : []),
    ...(env.META_AD_ACCOUNT_ID ? [{ platform: 'META_ADS' as const, accountId: env.META_AD_ACCOUNT_ID.replace(/^act_/, '') }] : []),
  ];
}

export async function loadRouteMappings(): Promise<RouteMapping[]> {
  const rows = await prisma.marketingCampaignRouteMapping.findMany();
  return rows.map((m) => ({
    platform: m.platform,
    accountId: m.accountId,
    campaignId: m.campaignId,
    routeCode: m.routeCode,
    method: m.method,
    allocationWeight: m.allocationWeight,
    effectiveFrom: m.effectiveFrom.toISOString().slice(0, 10),
    effectiveTo: m.effectiveTo ? m.effectiveTo.toISOString().slice(0, 10) : null,
  }));
}

export async function loadFunnelCounts(range: { from: Date; to: Date }): Promise<Record<string, number>> {
  const grouped = await prisma.marketingEvent.groupBy({
    by: ['eventName'],
    where: { occurredAt: { gte: range.from, lt: range.to } },
    _count: { _all: true },
  });
  return Object.fromEntries(grouped.map((g) => [g.eventName, g._count._all]));
}

export async function loadSyncHistory(limit = 50) {
  return prisma.adSyncRun.findMany({ orderBy: { startedAt: 'desc' }, take: limit });
}
