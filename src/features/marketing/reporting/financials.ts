import { Prisma, type BookingStatus, type PaymentProvider, type PaymentStatus, type RefundStatus } from '@prisma/client';
import { actual, aggregate, subtract, unknown, ZERO, type Aggregate, type Measured } from '@/features/marketing/reporting/measured';

/**
 * GiliFast's booking economics, as far as the ledger proves them.
 *
 * GiliFast is an intermediary: the customer pays `totalAmount` (gross booking
 * value, GMV), of which `commissionAmount` is GiliFast's (fare commission plus
 * the platform service fee, net of any promo discount GiliFast bears; see
 * src/features/pricing/pricing.ts) and `operatorAmount` is owed to the
 * operator. GMV is never revenue here.
 *
 * Commission recognition rule (documented in docs/MARKETING_MEASUREMENT.md):
 * - expected: `commissionAmount` of every verified-paid booking.
 * - earned: when the service is delivered as far as GiliFast can deliver it
 *   (the operator confirmed and tickets were issued), or when a paid booking
 *   is cancelled by the customer with no refund due (forfeit). A payment alone
 *   earns nothing: until confirmation the booking can still be refused and
 *   fully refunded.
 * - refunded: commission reversed out of what was earned. Only a COMPLETED
 *   refund of the whole booking amount proves the whole commission went back.
 *   A partial refund does not say how it splits between GiliFast and the
 *   operator (there is no settlement ledger), so it is unknown with bounds,
 *   never prorated.
 * - retained = earned − refunded.
 *
 * Costs: the PSP fee is known only when one was recorded (`gatewayFee > 0`).
 * The column defaults to 0 and the DOKU integration never writes it, so a 0
 * is "not recorded", not "free". Refund processing costs are not recorded
 * anywhere. The only booking-level variable cost the ledger holds is a travel
 * agent's commission.
 */

export type BookingFinancialFacts = {
  bookingId: string;
  currency: string;
  status: BookingStatus;
  totalAmount: Prisma.Decimal;
  commissionAmount: Prisma.Decimal;
  agentCommissionAmount: Prisma.Decimal | null;
  ticketCount: number;
  payment: {
    status: PaymentStatus;
    paidAt: Date | null;
    amount: Prisma.Decimal;
    gatewayProvider: PaymentProvider;
    gatewayFee: Prisma.Decimal;
  } | null;
  refund: {
    status: RefundStatus;
    refundAmount: Prisma.Decimal;
    originalAmount: Prisma.Decimal;
  } | null;
};

export type Recognition =
  | 'not_paid'
  | 'pending_fulfillment'
  | 'fulfilled'
  | 'forfeited'
  | 'reversed_before_fulfillment'
  | 'reversed_after_fulfillment'
  | 'undetermined';

export type BookingFinancials = {
  bookingId: string;
  currency: string;
  /** Verified payment: the Payment row was settled by a signature-verified gateway callback or server capture. */
  paid: boolean;
  /** Operator confirmed and tickets issued, and still standing (not cancelled since). */
  fulfilled: boolean;
  /** Tickets were issued at some point, even if the booking was cancelled later. */
  ticketed: boolean;
  cancelled: boolean;
  recognition: Recognition;
  grossBookingValue: Prisma.Decimal;
  expectedCommission: Prisma.Decimal;
  earnedCommission: Measured;
  refundedCommission: Measured;
  retainedCommission: Measured;
  /** Expected commission that was never earned because the booking was refunded before fulfilment. */
  forfeitedExpectedCommission: Prisma.Decimal;
  refundAmount: Measured;
  paymentProcessingCost: Measured;
  refundProcessingCost: Measured;
  otherVariableCosts: Measured;
  preAdContribution: Measured;
};

const CANCELLED: BookingStatus[] = ['CANCELLED_BY_CUSTOMER', 'CANCELLED_BY_OPERATOR'];
const REFUND_IN_FLIGHT: RefundStatus[] = ['PENDING', 'APPROVED', 'PROCESSING'];

export function isVerifiedPaid(f: Pick<BookingFinancialFacts, 'payment'>): boolean {
  return f.payment?.status === 'SUCCESSFUL' && f.payment.paidAt !== null;
}

export function isFulfilled(f: Pick<BookingFinancialFacts, 'status' | 'ticketCount' | 'payment'>): boolean {
  return isVerifiedPaid(f) && f.status === 'CONFIRMED' && f.ticketCount > 0;
}

export function computeBookingFinancials(f: BookingFinancialFacts): BookingFinancials {
  const paid = isVerifiedPaid(f);
  const fulfilled = isFulfilled(f);
  const ticketed = paid && f.ticketCount > 0;
  const cancelled = CANCELLED.includes(f.status);
  const c = f.commissionAmount;
  const base = {
    bookingId: f.bookingId,
    currency: f.currency,
    paid,
    fulfilled,
    ticketed,
    cancelled,
    grossBookingValue: f.totalAmount,
  };

  if (!paid) {
    const none = unknown('NOT_PAID');
    return {
      ...base,
      recognition: 'not_paid',
      expectedCommission: ZERO,
      earnedCommission: actual(0, 'NOT_PAID'),
      refundedCommission: actual(0),
      retainedCommission: actual(0, 'NOT_PAID'),
      forfeitedExpectedCommission: ZERO,
      refundAmount: actual(0),
      paymentProcessingCost: none,
      refundProcessingCost: actual(0),
      otherVariableCosts: actual(0),
      preAdContribution: actual(0, 'NOT_PAID'),
    };
  }

  const refund = f.refund && f.refund.status !== 'REJECTED' ? f.refund : null;
  const refundCompleted = refund?.status === 'COMPLETED';
  const fullRefund = refundCompleted && refund!.refundAmount.gte(f.totalAmount);
  const refundAmount: Measured = !refund
    ? actual(0)
    : refundCompleted
      ? actual(refund.refundAmount)
      : unknown(refund.status === 'FAILED' ? 'REFUND_FAILED' : 'REFUND_IN_PROGRESS', { lowerBound: 0, upperBound: refund.refundAmount });

  let recognition: Recognition;
  let earned: Measured;
  let refunded: Measured;
  let forfeited = ZERO;

  if (!refund) {
    if (fulfilled) {
      recognition = 'fulfilled';
      earned = actual(c);
      refunded = actual(0);
    } else if (f.status === 'CANCELLED_BY_CUSTOMER') {
      // Cancelled inside the no-refund window: the customer's money stays.
      recognition = 'forfeited';
      earned = actual(c, 'FORFEITED_NO_REFUND_DUE');
      refunded = actual(0);
    } else if (cancelled) {
      recognition = 'undetermined';
      earned = unknown('CANCELLED_WITHOUT_REFUND_RECORD', { lowerBound: 0, upperBound: c });
      refunded = actual(0);
    } else {
      recognition = 'pending_fulfillment';
      earned = actual(0, 'NOT_YET_EARNED');
      refunded = actual(0);
    }
  } else if (fullRefund) {
    if (ticketed) {
      recognition = 'reversed_after_fulfillment';
      earned = actual(c);
      refunded = actual(c, 'FULL_REFUND');
    } else {
      recognition = 'reversed_before_fulfillment';
      earned = actual(0);
      refunded = actual(0);
      forfeited = c;
    }
  } else if (refundCompleted) {
    // Partial refund: the split between GiliFast and the operator is not
    // recorded anywhere, so the commission kept lies between
    // max(0, c − refund) and c.
    recognition = 'undetermined';
    const floor = Prisma.Decimal.max(c.sub(refund.refundAmount), ZERO);
    earned = ticketed ? actual(c) : unknown('PARTIAL_REFUND_SPLIT_UNDEFINED', { lowerBound: 0, upperBound: c });
    refunded = unknown('PARTIAL_REFUND_SPLIT_UNDEFINED', { lowerBound: 0, upperBound: Prisma.Decimal.min(refund.refundAmount, c) });
    if (!ticketed) {
      return finish(base, f, {
        recognition,
        expected: c,
        earned,
        refunded,
        retained: unknown('PARTIAL_REFUND_SPLIT_UNDEFINED', { lowerBound: floor, upperBound: c }),
        forfeited,
        refundAmount,
        hasRefund: true,
      });
    }
  } else {
    recognition = 'undetermined';
    const reason = refund.status === 'FAILED' ? 'REFUND_FAILED' : 'REFUND_IN_PROGRESS';
    earned = ticketed ? actual(c) : unknown(reason, { lowerBound: 0, upperBound: c });
    refunded = unknown(reason, { lowerBound: 0, upperBound: Prisma.Decimal.min(refund.refundAmount, c) });
  }

  return finish(base, f, {
    recognition,
    expected: c,
    earned,
    refunded,
    retained: subtract(earned, refunded),
    forfeited,
    refundAmount,
    hasRefund: Boolean(refund),
  });
}

function finish(
  base: Pick<BookingFinancials, 'bookingId' | 'currency' | 'paid' | 'fulfilled' | 'ticketed' | 'cancelled' | 'grossBookingValue'>,
  f: BookingFinancialFacts,
  r: {
    recognition: Recognition;
    expected: Prisma.Decimal;
    earned: Measured;
    refunded: Measured;
    retained: Measured;
    forfeited: Prisma.Decimal;
    refundAmount: Measured;
    hasRefund: boolean;
  },
): BookingFinancials {
  const fee = f.payment!.gatewayFee;
  const paymentProcessingCost = fee.gt(0)
    ? actual(fee, f.payment!.gatewayProvider === 'PAYPAL' ? 'PAYPAL_FEE_CONVERTED_AT_CAPTURE_RATE' : 'RECORDED_FEE')
    : unknown(f.payment!.gatewayProvider === 'DOKU' ? 'DOKU_FEE_NOT_RECORDED' : 'PSP_FEE_NOT_RECORDED');
  const refundProcessingCost = r.hasRefund ? unknown('REFUND_COST_NOT_RECORDED') : actual(0);
  const otherVariableCosts = f.agentCommissionAmount
    ? actual(f.agentCommissionAmount, 'AGENT_COMMISSION')
    : actual(0, 'ONLY_AGENT_COMMISSION_MODELED');
  return {
    ...base,
    recognition: r.recognition,
    expectedCommission: r.expected,
    earnedCommission: r.earned,
    refundedCommission: r.refunded,
    retainedCommission: r.retained,
    forfeitedExpectedCommission: r.forfeited,
    refundAmount: r.refundAmount,
    paymentProcessingCost,
    refundProcessingCost,
    otherVariableCosts,
    preAdContribution: subtract(r.retained, paymentProcessingCost, refundProcessingCost, otherVariableCosts),
  };
}

export type FinancialSummary = {
  currency: string;
  paidBookings: number;
  fulfilledBookings: number;
  pendingFulfillment: number;
  cancelledPaidBookings: number;
  refundedBookings: number;
  grossBookingValue: Prisma.Decimal;
  expectedCommission: Prisma.Decimal;
  forfeitedExpectedCommission: Prisma.Decimal;
  earnedCommission: Aggregate;
  refundedCommission: Aggregate;
  retainedCommission: Aggregate;
  refundedValue: Aggregate;
  paymentProcessingCosts: Aggregate;
  refundProcessingCosts: Aggregate;
  otherVariableCosts: Aggregate;
  preAdContribution: Aggregate;
};

/**
 * Sum the paid bookings of one currency. Mixing currencies is refused: the
 * ledger is IDR today, and a conversion needs a documented rate and date.
 */
export function summarizeFinancials(rows: BookingFinancials[]): FinancialSummary {
  const paid = rows.filter((r) => r.paid);
  const currencies = [...new Set(paid.map((r) => r.currency))];
  if (currencies.length > 1) {
    throw new CurrencyMixError(currencies);
  }
  const sum = (pick: (r: BookingFinancials) => Prisma.Decimal) => paid.reduce((acc, r) => acc.add(pick(r)), ZERO);
  return {
    currency: currencies[0] ?? 'IDR',
    paidBookings: paid.length,
    fulfilledBookings: paid.filter((r) => r.fulfilled).length,
    pendingFulfillment: paid.filter((r) => r.recognition === 'pending_fulfillment').length,
    cancelledPaidBookings: paid.filter((r) => r.cancelled).length,
    refundedBookings: paid.filter((r) => r.refundAmount.value === null || r.refundAmount.value.gt(0)).length,
    grossBookingValue: sum((r) => r.grossBookingValue),
    expectedCommission: sum((r) => r.expectedCommission),
    forfeitedExpectedCommission: sum((r) => r.forfeitedExpectedCommission),
    earnedCommission: aggregate(paid.map((r) => r.earnedCommission)),
    refundedCommission: aggregate(paid.map((r) => r.refundedCommission)),
    retainedCommission: aggregate(paid.map((r) => r.retainedCommission)),
    refundedValue: aggregate(paid.map((r) => r.refundAmount)),
    paymentProcessingCosts: aggregate(paid.map((r) => r.paymentProcessingCost)),
    refundProcessingCosts: aggregate(paid.map((r) => r.refundProcessingCost)),
    otherVariableCosts: aggregate(paid.map((r) => r.otherVariableCosts)),
    preAdContribution: aggregate(paid.map((r) => r.preAdContribution)),
  };
}

export class CurrencyMixError extends Error {
  constructor(public currencies: string[]) {
    super(`Refusing to sum amounts in different currencies (${currencies.join(', ')}) without a documented FX rate`);
    this.name = 'CurrencyMixError';
  }
}
