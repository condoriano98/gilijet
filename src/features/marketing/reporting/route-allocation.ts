import { Prisma, type AdPlatform, type CampaignRouteMethod } from '@prisma/client';

/**
 * Campaign spend to routes, kept in three separate buckets:
 * - direct: a campaign mapped DIRECT to one route; its spend is observed
 *   route spend;
 * - allocated: a shared campaign split by explicit weights; an estimate, and
 *   always labelled one;
 * - unallocated: no active mapping, or an invalid one (weights over 1, DIRECT
 *   mixed with ALLOCATED, two DIRECT routes). Never dropped and never spread.
 *
 * Bookings are not allocated here: route bookings come from their own
 * attribution, and unattributed bookings are never distributed over routes.
 */
export type CampaignDaySpend = { platform: AdPlatform; accountId: string; campaignId: string; date: string; currency: string; spend: Prisma.Decimal };

export type RouteMapping = {
  platform: AdPlatform;
  accountId: string;
  campaignId: string;
  routeCode: string;
  method: CampaignRouteMethod;
  allocationWeight: Prisma.Decimal;
  effectiveFrom: string;
  effectiveTo: string | null;
};

export type RouteSpend = { routeCode: string; currency: string; direct: Prisma.Decimal; allocated: Prisma.Decimal; allocatedIsEstimate: true };

export type AllocationResult = {
  routes: RouteSpend[];
  unallocated: Array<{ currency: string; spend: Prisma.Decimal; campaigns: string[] }>;
  invalidMappings: Array<{ campaign: string; date: string; reason: string }>;
};

const ZERO = new Prisma.Decimal(0);

export function allocateCampaignSpend(spend: CampaignDaySpend[], mappings: RouteMapping[]): AllocationResult {
  const routes = new Map<string, RouteSpend>();
  const unallocated = new Map<string, { currency: string; spend: Prisma.Decimal; campaigns: Set<string> }>();
  const invalid: AllocationResult['invalidMappings'] = [];
  const route = (code: string, currency: string) => {
    const k = `${code}|${currency}`;
    const r = routes.get(k) ?? { routeCode: code, currency, direct: ZERO, allocated: ZERO, allocatedIsEstimate: true as const };
    routes.set(k, r);
    return r;
  };
  const leave = (s: CampaignDaySpend, amount: Prisma.Decimal) => {
    if (amount.isZero()) return;
    const u = unallocated.get(s.currency) ?? { currency: s.currency, spend: ZERO, campaigns: new Set<string>() };
    u.spend = u.spend.add(amount);
    u.campaigns.add(`${s.platform}|${s.accountId}|${s.campaignId}`);
    unallocated.set(s.currency, u);
  };

  for (const s of spend) {
    const active = mappings.filter(
      (m) =>
        m.platform === s.platform &&
        m.accountId === s.accountId &&
        m.campaignId === s.campaignId &&
        m.effectiveFrom <= s.date &&
        (m.effectiveTo === null || s.date <= m.effectiveTo),
    );
    const campaign = `${s.platform}|${s.accountId}|${s.campaignId}`;
    if (active.length === 0) {
      leave(s, s.spend);
      continue;
    }
    const direct = active.filter((m) => m.method === 'DIRECT');
    const shared = active.filter((m) => m.method === 'ALLOCATED');
    if (direct.length > 0 && shared.length > 0) {
      invalid.push({ campaign, date: s.date, reason: 'DIRECT_AND_ALLOCATED_MIXED' });
      leave(s, s.spend);
      continue;
    }
    if (direct.length > 1) {
      invalid.push({ campaign, date: s.date, reason: 'MULTIPLE_DIRECT_ROUTES' });
      leave(s, s.spend);
      continue;
    }
    if (direct.length === 1) {
      const r = route(direct[0].routeCode, s.currency);
      r.direct = r.direct.add(s.spend);
      continue;
    }
    const total = shared.reduce((acc, m) => acc.add(m.allocationWeight), ZERO);
    if (total.gt(1) || shared.some((m) => m.allocationWeight.lte(0))) {
      invalid.push({ campaign, date: s.date, reason: 'WEIGHTS_INVALID' });
      leave(s, s.spend);
      continue;
    }
    let given = ZERO;
    for (const m of shared) {
      const part = s.spend.mul(m.allocationWeight);
      const r = route(m.routeCode, s.currency);
      r.allocated = r.allocated.add(part);
      given = given.add(part);
    }
    leave(s, s.spend.sub(given));
  }
  return {
    routes: [...routes.values()],
    unallocated: [...unallocated.values()].map((u) => ({ currency: u.currency, spend: u.spend, campaigns: [...u.campaigns] })),
    invalidMappings: invalid,
  };
}
