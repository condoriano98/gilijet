import { Prisma } from '@prisma/client';
import { channelGroup, type ChannelGroup } from '@/features/marketing/attribution';
import type { BookingFinancials, FinancialSummary } from '@/features/marketing/reporting/financials';
import { summarizeFinancials } from '@/features/marketing/reporting/financials';
import type { Aggregate } from '@/features/marketing/reporting/measured';
import {
  commissionRoas,
  contributionRoas,
  fulfilledBookingCpa,
  netMarketingContribution,
  paidBookingCpa,
  paymentToFulfillmentRate,
  refundRateByCount,
  refundRateByValue,
  type MetricResult,
  type SpendInput,
} from '@/features/marketing/reporting/metrics';
import type { TimeBasis } from '@/features/marketing/reporting/time-models';

/**
 * Data contracts for the Stage 5 dashboard (not built yet). Each builder is
 * pure: it takes ledger-derived facts and returns a view model in which every
 * figure carries its completeness. Nothing here claims incrementality; these
 * are attributed and period figures, labelled as such.
 */

export type ExecutiveOverview = {
  basis: TimeBasis;
  currency: string;
  advertisingSpend: SpendInput;
  paidBookings: number;
  fulfilledBookings: number;
  paidBookingCpa: MetricResult;
  fulfilledBookingCpa: MetricResult;
  grossBookingValue: Prisma.Decimal;
  expectedCommission: Prisma.Decimal;
  retainedCommission: Aggregate;
  commissionRoas: MetricResult;
  contributionRoas: MetricResult;
  netMarketingContribution: MetricResult;
  paymentToFulfillmentRate: MetricResult;
  refundRateByCount: MetricResult;
  refundRateByValue: MetricResult;
};

export function buildExecutiveOverview(basis: TimeBasis, f: FinancialSummary, spend: SpendInput): ExecutiveOverview {
  return {
    basis,
    currency: f.currency,
    advertisingSpend: spend,
    paidBookings: f.paidBookings,
    fulfilledBookings: f.fulfilledBookings,
    paidBookingCpa: paidBookingCpa(spend, f),
    fulfilledBookingCpa: fulfilledBookingCpa(spend, f),
    grossBookingValue: f.grossBookingValue,
    expectedCommission: f.expectedCommission,
    retainedCommission: f.retainedCommission,
    commissionRoas: commissionRoas(spend, f),
    contributionRoas: contributionRoas(spend, f),
    netMarketingContribution: netMarketingContribution(spend, f),
    paymentToFulfillmentRate: paymentToFulfillmentRate(f),
    refundRateByCount: refundRateByCount(f),
    refundRateByValue: refundRateByValue(f),
  };
}

/** A booking as the acquisition and route views see it. */
export type AttributedBooking = {
  financials: BookingFinancials;
  channel: string | null;
  platform: 'google' | 'meta' | null;
  campaignId: string | null;
  routeCode: string | null;
  operatorId: string;
  status: string;
};

export type ChannelRow = { group: ChannelGroup; channel: string; summary: FinancialSummary };

export type AcquisitionView = {
  rows: ChannelRow[];
  /** Paid bookings with any attribution evidence (paid, non-paid or direct) / all paid bookings. */
  attributionCoverage: MetricResult;
  unattributedPaidBookings: number;
  consentUnavailablePaidBookings: number;
};

export function buildAcquisitionView(bookings: AttributedBooking[]): AcquisitionView {
  const groups = new Map<string, AttributedBooking[]>();
  for (const b of bookings) {
    const k = b.channel ?? 'unknown';
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(b);
  }
  const rows = [...groups.entries()].map(([channel, list]) => ({
    group: channelGroup(channel),
    channel,
    summary: summarizeFinancials(list.map((b) => b.financials)),
  }));
  const paid = bookings.filter((b) => b.financials.paid);
  const unknown = paid.filter((b) => channelGroup(b.channel) === 'unknown').length;
  const noConsent = paid.filter((b) => channelGroup(b.channel) === 'consent_unavailable').length;
  const evidenced = paid.length - unknown - noConsent;
  return {
    rows,
    attributionCoverage: paid.length
      ? { status: 'ok', value: decimal(evidenced).div(paid.length) }
      : { status: 'unavailable', reasons: ['NO_PAID_BOOKINGS'] },
    unattributedPaidBookings: unknown,
    consentUnavailablePaidBookings: noConsent,
  };
}

export const FUNNEL_STEPS = [
  'search',
  'view_item',
  'booking_request_created',
  'begin_checkout',
  'purchase',
  'seat_confirmed',
  'ticket_issued',
] as const;

export type FunnelView = {
  steps: Array<{ step: (typeof FUNNEL_STEPS)[number]; events: number; consentGated: boolean }>;
  cancellations: number;
  refunds: number;
  caveats: string[];
};

/**
 * Event counts per step. Browser steps (search, view_item) are recorded only
 * with analytics consent, so they undercount; server steps count every
 * booking. Step-to-step ratios across that boundary are not conversion rates.
 */
export function buildFunnelView(counts: Partial<Record<string, number>>): FunnelView {
  return {
    steps: FUNNEL_STEPS.map((step) => ({ step, events: counts[step] ?? 0, consentGated: step === 'search' || step === 'view_item' })),
    cancellations: counts.booking_cancelled ?? 0,
    refunds: counts.refund ?? 0,
    caveats: [
      'search and view_item are counted only for visitors who accepted analytics cookies.',
      'Event counts, not a cohort: one visitor can search many times.',
    ],
  };
}

export type RouteOperatorRow = {
  key: string;
  summary: FinancialSummary;
  /** Paid bookings the operator turned down / paid bookings with an operator decision. */
  operatorRejectionRate: MetricResult;
  paymentToFulfillmentRate: MetricResult;
  refundRateByCount: MetricResult;
};

export function buildRouteOperatorRows(bookings: AttributedBooking[], by: 'route' | 'operator'): RouteOperatorRow[] {
  const groups = new Map<string, AttributedBooking[]>();
  for (const b of bookings) {
    const k = (by === 'route' ? b.routeCode : b.operatorId) ?? 'unknown';
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(b);
  }
  return [...groups.entries()].map(([key, list]) => {
    const summary = summarizeFinancials(list.map((b) => b.financials));
    const paid = list.filter((b) => b.financials.paid);
    const rejected = paid.filter((b) => b.status === 'CANCELLED_BY_OPERATOR' && !b.financials.ticketed).length;
    const decided = paid.filter((b) => b.financials.ticketed || b.status === 'CANCELLED_BY_OPERATOR').length;
    return {
      key,
      summary,
      operatorRejectionRate: decided ? { status: 'ok', value: decimal(rejected).div(decided) } : { status: 'unavailable', reasons: ['NO_OPERATOR_DECISIONS'] },
      paymentToFulfillmentRate: paymentToFulfillmentRate(summary),
      refundRateByCount: refundRateByCount(summary),
    };
  });
}

function decimal(n: number): Prisma.Decimal {
  return new Prisma.Decimal(n);
}
