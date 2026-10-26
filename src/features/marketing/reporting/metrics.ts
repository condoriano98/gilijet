import { Prisma } from '@prisma/client';
import type { Aggregate } from '@/features/marketing/reporting/measured';
import type { FinancialSummary } from '@/features/marketing/reporting/financials';

/**
 * Marketing metrics on top of the financial contract. Every result says
 * whether it is a full answer, a partial one (some inputs unknown: the value
 * covers only what is known, and the reason says what is missing) or not
 * computable at all. A zero denominator is never turned into 0 or infinity.
 *
 * Paid-booking metrics count verified payments; fulfilled-booking metrics
 * count operator-confirmed, ticketed bookings that still stand. The two are
 * reported side by side, never merged into one "conversion".
 */
export type MetricResult =
  | { status: 'ok'; value: Prisma.Decimal }
  | { status: 'partial'; value: Prisma.Decimal; reasons: string[] }
  | { status: 'unavailable'; reasons: string[] };

/** Advertising spend for the same scope, as ingestion knows it. */
export type SpendInput = {
  status: 'complete' | 'partial' | 'unavailable';
  amount: Prisma.Decimal;
  currency: string;
  reasons: string[];
};

const ok = (value: Prisma.Decimal): MetricResult => ({ status: 'ok', value });
const unavailable = (...reasons: string[]): MetricResult => ({ status: 'unavailable', reasons });

function divide(
  numerator: { value: Prisma.Decimal; complete: boolean; reasons: string[] },
  denominator: { value: Prisma.Decimal; complete: boolean; reasons: string[] },
  zeroReason: string,
): MetricResult {
  if (denominator.value.isZero()) return unavailable(zeroReason, ...denominator.reasons);
  const value = numerator.value.div(denominator.value);
  const reasons = [...new Set([...numerator.reasons, ...denominator.reasons])];
  return numerator.complete && denominator.complete ? ok(value) : { status: 'partial', value, reasons };
}

function spendTerm(spend: SpendInput, currency: string) {
  if (spend.status === 'unavailable') return null;
  if (spend.currency !== currency) return 'CURRENCY_MISMATCH' as const;
  return { value: spend.amount, complete: spend.status === 'complete', reasons: spend.reasons };
}

function aggTerm(a: Aggregate) {
  return { value: a.known, complete: a.status === 'complete', reasons: a.reasons };
}

const countTerm = (n: number) => ({ value: new Prisma.Decimal(n), complete: true, reasons: [] as string[] });

function withSpend(spend: SpendInput, currency: string, fn: (s: NonNullable<Exclude<ReturnType<typeof spendTerm>, 'CURRENCY_MISMATCH'>>) => MetricResult): MetricResult {
  const s = spendTerm(spend, currency);
  if (s === null) return unavailable('SPEND_UNAVAILABLE', ...spend.reasons);
  if (s === 'CURRENCY_MISMATCH') return unavailable(`SPEND_CURRENCY_${spend.currency}_VS_LEDGER_${currency}`);
  return fn(s);
}

/** Advertising spend / verified paid bookings. */
export function paidBookingCpa(spend: SpendInput, f: FinancialSummary): MetricResult {
  return withSpend(spend, f.currency, (s) => divide(s, countTerm(f.paidBookings), 'NO_PAID_BOOKINGS'));
}

/** Advertising spend / fulfilled (confirmed and ticketed) paid bookings. */
export function fulfilledBookingCpa(spend: SpendInput, f: FinancialSummary): MetricResult {
  return withSpend(spend, f.currency, (s) => divide(s, countTerm(f.fulfilledBookings), 'NO_FULFILLED_BOOKINGS'));
}

/** Retained commission / advertising spend. */
export function commissionRoas(spend: SpendInput, f: FinancialSummary): MetricResult {
  return withSpend(spend, f.currency, (s) => divide(aggTerm(f.retainedCommission), s, 'NO_SPEND'));
}

/** Pre-ad contribution / advertising spend. */
export function contributionRoas(spend: SpendInput, f: FinancialSummary): MetricResult {
  return withSpend(spend, f.currency, (s) => divide(aggTerm(f.preAdContribution), s, 'NO_SPEND'));
}

/**
 * Pre-ad contribution − advertising spend. Excludes fixed overhead: this is
 * not net profit. With unknown costs the known part is an upper bound.
 */
export function netMarketingContribution(spend: SpendInput, f: FinancialSummary): MetricResult {
  return withSpend(spend, f.currency, (s) => {
    const value = f.preAdContribution.known.sub(s.value);
    const complete = f.preAdContribution.status === 'complete' && s.complete;
    if (f.preAdContribution.status === 'unavailable') return unavailable('CONTRIBUTION_UNAVAILABLE', ...f.preAdContribution.reasons);
    return complete ? ok(value) : { status: 'partial', value, reasons: [...new Set([...f.preAdContribution.reasons, ...s.reasons])] };
  });
}

/** Fulfilled paid bookings / verified paid bookings. */
export function paymentToFulfillmentRate(f: FinancialSummary): MetricResult {
  if (f.paidBookings === 0) return unavailable('NO_PAID_BOOKINGS');
  const value = new Prisma.Decimal(f.fulfilledBookings).div(f.paidBookings);
  // Bookings still waiting on the operator call make the rate immature.
  return f.pendingFulfillment > 0
    ? { status: 'partial', value, reasons: [`${f.pendingFulfillment}_AWAITING_OPERATOR_CONFIRMATION`] }
    : ok(value);
}

/** Paid bookings with a refund / paid bookings (count basis). */
export function refundRateByCount(f: FinancialSummary): MetricResult {
  if (f.paidBookings === 0) return unavailable('NO_PAID_BOOKINGS');
  return ok(new Prisma.Decimal(f.refundedBookings).div(f.paidBookings));
}

/** Refunded value / gross booking value (value basis). */
export function refundRateByValue(f: FinancialSummary): MetricResult {
  if (f.grossBookingValue.isZero()) return unavailable('NO_GROSS_BOOKING_VALUE');
  return divide(aggTerm(f.refundedValue), { value: f.grossBookingValue, complete: true, reasons: [] }, 'NO_GROSS_BOOKING_VALUE');
}

/** Pre-ad contribution / fulfilled bookings. */
export function contributionPerFulfilledBooking(f: FinancialSummary): MetricResult {
  return divide(aggTerm(f.preAdContribution), countTerm(f.fulfilledBookings), 'NO_FULFILLED_BOOKINGS');
}

export function metricValue(m: MetricResult): Prisma.Decimal | null {
  return m.status === 'unavailable' ? null : m.value;
}

