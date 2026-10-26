import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';
import {
  computeBookingFinancials,
  summarizeFinancials,
  CurrencyMixError,
  type BookingFinancialFacts,
} from '@/features/marketing/reporting/financials';
import {
  commissionRoas,
  contributionPerFulfilledBooking,
  contributionRoas,
  fulfilledBookingCpa,
  netMarketingContribution,
  paidBookingCpa,
  paymentToFulfillmentRate,
  refundRateByCount,
  refundRateByValue,
  type SpendInput,
} from '@/features/marketing/reporting/metrics';
import { aggregate, actual, unknown } from '@/features/marketing/reporting/measured';

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

function facts(over: Partial<BookingFinancialFacts> = {}): BookingFinancialFacts {
  return {
    bookingId: 'bk',
    currency: 'IDR',
    status: 'CONFIRMED',
    totalAmount: D('1000000'),
    commissionAmount: D('80000'),
    agentCommissionAmount: null,
    ticketCount: 2,
    payment: { status: 'SUCCESSFUL', paidAt: new Date('2026-10-20T03:00:00Z'), amount: D('1000000'), gatewayProvider: 'PAYPAL', gatewayFee: D('35000') },
    refund: null,
    ...over,
  };
}

const spend = (amount: Prisma.Decimal.Value, status: SpendInput['status'] = 'complete', currency = 'IDR'): SpendInput => ({
  status,
  amount: D(amount),
  currency,
  reasons: status === 'complete' ? [] : ['SPEND_SYNC_INCOMPLETE'],
});

describe('booking financials: recognition rule', () => {
  it('a fulfilled booking with no refund earns and retains its commission; GMV is not revenue', () => {
    const f = computeBookingFinancials(facts());
    expect(f.recognition).toBe('fulfilled');
    expect(f.grossBookingValue.toString()).toBe('1000000');
    expect(f.expectedCommission.toString()).toBe('80000');
    expect(f.retainedCommission).toMatchObject({ provenance: 'actual' });
    expect(f.retainedCommission.value!.toString()).toBe('80000');
    // 80,000 − 35,000 PSP fee
    expect(f.preAdContribution.value!.toString()).toBe('45000');
  });

  it('a paid booking awaiting the operator call has expected but not earned commission', () => {
    const f = computeBookingFinancials(facts({ status: 'AWAITING_CONFIRMATION', ticketCount: 0 }));
    expect(f.recognition).toBe('pending_fulfillment');
    expect(f.fulfilled).toBe(false);
    expect(f.expectedCommission.toString()).toBe('80000');
    expect(f.earnedCommission.value!.toString()).toBe('0');
    expect(f.retainedCommission.value!.toString()).toBe('0');
  });

  it('an unpaid booking contributes nothing and is not paid', () => {
    const f = computeBookingFinancials(facts({ status: 'PENDING_PAYMENT', ticketCount: 0, payment: { status: 'PENDING', paidAt: null, amount: D('1000000'), gatewayProvider: 'DOKU', gatewayFee: D(0) } }));
    expect(f.paid).toBe(false);
    expect(f.expectedCommission.toString()).toBe('0');
  });

  it('operator rejection with a completed full refund forfeits the expected commission without earning it', () => {
    const f = computeBookingFinancials(
      facts({ status: 'CANCELLED_BY_OPERATOR', ticketCount: 0, refund: { status: 'COMPLETED', refundAmount: D('1000000'), originalAmount: D('1000000') } }),
    );
    expect(f.recognition).toBe('reversed_before_fulfillment');
    expect(f.earnedCommission.value!.toString()).toBe('0');
    expect(f.retainedCommission.value!.toString()).toBe('0');
    expect(f.forfeitedExpectedCommission.toString()).toBe('80000');
    expect(f.refundProcessingCost.provenance).toBe('unknown');
  });

  it('a ticketed booking cancelled with a full refund earned then reversed the commission', () => {
    const f = computeBookingFinancials(
      facts({ status: 'CANCELLED_BY_CUSTOMER', ticketCount: 2, refund: { status: 'COMPLETED', refundAmount: D('1000000'), originalAmount: D('1000000') } }),
    );
    expect(f.recognition).toBe('reversed_after_fulfillment');
    expect(f.earnedCommission.value!.toString()).toBe('80000');
    expect(f.refundedCommission.value!.toString()).toBe('80000');
    expect(f.retainedCommission.value!.toString()).toBe('0');
    expect(f.fulfilled).toBe(false);
  });

  it('a partial refund is never prorated: retained commission is unknown with bounds', () => {
    const f = computeBookingFinancials(
      facts({ status: 'CANCELLED_BY_CUSTOMER', ticketCount: 2, refund: { status: 'COMPLETED', refundAmount: D('500000'), originalAmount: D('1000000') } }),
    );
    expect(f.retainedCommission.provenance).toBe('unknown');
    expect(f.retainedCommission.value).toBeNull();
    expect(f.retainedCommission.reasons).toContain('PARTIAL_REFUND_SPLIT_UNDEFINED');
    expect(f.retainedCommission.lowerBound!.toString()).toBe('0');
    expect(f.retainedCommission.upperBound!.toString()).toBe('80000');
  });

  it('a refund still in progress leaves retained commission unknown', () => {
    const f = computeBookingFinancials(facts({ status: 'CANCELLED_BY_CUSTOMER', ticketCount: 0, refund: { status: 'APPROVED', refundAmount: D('1000000'), originalAmount: D('1000000') } }));
    expect(f.retainedCommission.provenance).toBe('unknown');
    expect(f.retainedCommission.reasons).toContain('REFUND_IN_PROGRESS');
  });

  it('a customer cancellation with no refund due keeps the commission as forfeit', () => {
    const f = computeBookingFinancials(facts({ status: 'CANCELLED_BY_CUSTOMER', ticketCount: 2, refund: null }));
    expect(f.recognition).toBe('forfeited');
    expect(f.retainedCommission.value!.toString()).toBe('80000');
    expect(f.cancelled).toBe(true);
  });

  it('a rejected refund request counts as no refund', () => {
    const f = computeBookingFinancials(facts({ refund: { status: 'REJECTED', refundAmount: D('500000'), originalAmount: D('1000000') } }));
    expect(f.retainedCommission.value!.toString()).toBe('80000');
  });

  it('an unrecorded DOKU fee is unknown, not zero, and makes contribution an upper bound', () => {
    const f = computeBookingFinancials(facts({ payment: { status: 'SUCCESSFUL', paidAt: new Date(), amount: D('1000000'), gatewayProvider: 'DOKU', gatewayFee: D(0) } }));
    expect(f.paymentProcessingCost).toMatchObject({ provenance: 'unknown', value: null, reasons: ['DOKU_FEE_NOT_RECORDED'] });
    expect(f.preAdContribution.value).toBeNull();
    expect(f.preAdContribution.upperBound).toBeUndefined();
  });

  it('subtracts a travel agent commission as a recorded variable cost', () => {
    const f = computeBookingFinancials(facts({ agentCommissionAmount: D('10000') }));
    expect(f.preAdContribution.value!.toString()).toBe('35000');
  });

  it('keeps Decimal precision where floats would drift', () => {
    const a = computeBookingFinancials(facts({ bookingId: 'a', commissionAmount: D('0.1'), payment: { status: 'SUCCESSFUL', paidAt: new Date(), amount: D(1), gatewayProvider: 'PAYPAL', gatewayFee: D('0.01') } }));
    const b = computeBookingFinancials(facts({ bookingId: 'b', commissionAmount: D('0.2'), payment: { status: 'SUCCESSFUL', paidAt: new Date(), amount: D(1), gatewayProvider: 'PAYPAL', gatewayFee: D('0.01') } }));
    const s = summarizeFinancials([a, b]);
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(s.retainedCommission.known.toString()).toBe('0.3');
    expect(s.preAdContribution.known.toString()).toBe('0.28');
  });
});

describe('summaries and metrics', () => {
  const rows = [
    computeBookingFinancials(facts({ bookingId: 'f1' })),
    computeBookingFinancials(facts({ bookingId: 'f2', totalAmount: D('2000000'), commissionAmount: D('160000') })),
    computeBookingFinancials(facts({ bookingId: 'p1', status: 'AWAITING_CONFIRMATION', ticketCount: 0 })),
    computeBookingFinancials(facts({ bookingId: 'r1', status: 'CANCELLED_BY_OPERATOR', ticketCount: 0, refund: { status: 'COMPLETED', refundAmount: D('1000000'), originalAmount: D('1000000') } })),
    computeBookingFinancials(facts({ bookingId: 'u1', status: 'PENDING_PAYMENT', ticketCount: 0, payment: { status: 'PENDING', paidAt: null, amount: D(1), gatewayProvider: 'DOKU', gatewayFee: D(0) } })),
  ];
  const s = summarizeFinancials(rows);

  it('counts verified paid, fulfilled and pending bookings separately', () => {
    expect(s.paidBookings).toBe(4);
    expect(s.fulfilledBookings).toBe(2);
    expect(s.pendingFulfillment).toBe(1);
    expect(s.cancelledPaidBookings).toBe(1);
    expect(s.grossBookingValue.toString()).toBe('5000000');
    // Expected includes the pending and the refunded booking: 80k + 160k + 80k + 80k.
    expect(s.expectedCommission.toString()).toBe('400000');
    expect(s.forfeitedExpectedCommission.toString()).toBe('80000');
    expect(s.retainedCommission.known.toString()).toBe('240000');
  });

  it('computes CPA, ROAS and net contribution with spend', () => {
    const sp = spend('400000');
    expect(paidBookingCpa(sp, s)).toEqual({ status: 'ok', value: D('100000') });
    expect(fulfilledBookingCpa(sp, s)).toEqual({ status: 'ok', value: D('200000') });
    // Retained commission is fully known (refund costs do not touch it)...
    expect(commissionRoas(sp, s)).toEqual({ status: 'ok', value: D('0.6') });
    // ...but contribution is not: the refund's processing cost is unrecorded.
    const roas = contributionRoas(sp, s);
    expect(roas).toMatchObject({ status: 'partial', reasons: ['REFUND_COST_NOT_RECORDED'] });
    const net = netMarketingContribution(sp, s);
    expect(net.status).toBe('partial');
  });

  it('handles zero denominators explicitly', () => {
    const empty = summarizeFinancials([]);
    expect(paidBookingCpa(spend('100'), empty)).toEqual({ status: 'unavailable', reasons: ['NO_PAID_BOOKINGS'] });
    expect(commissionRoas(spend('0'), s)).toEqual({ status: 'unavailable', reasons: ['NO_SPEND'] });
    expect(paymentToFulfillmentRate(empty).status).toBe('unavailable');
    expect(contributionPerFulfilledBooking(empty)).toEqual({ status: 'unavailable', reasons: ['NO_FULFILLED_BOOKINGS'] });
  });

  it('refuses spend it cannot trust or compare', () => {
    expect(paidBookingCpa({ status: 'unavailable', amount: D(0), currency: 'IDR', reasons: ['NO_SYNC'] }, s)).toEqual({ status: 'unavailable', reasons: ['SPEND_UNAVAILABLE', 'NO_SYNC'] });
    expect(paidBookingCpa(spend('100', 'complete', 'USD'), s)).toEqual({ status: 'unavailable', reasons: ['SPEND_CURRENCY_USD_VS_LEDGER_IDR'] });
    expect(paidBookingCpa(spend('400000', 'partial'), s).status).toBe('partial');
  });

  it('reports the payment-to-fulfilment rate as immature while bookings await confirmation', () => {
    expect(paymentToFulfillmentRate(s)).toEqual({ status: 'partial', value: D('0.5'), reasons: ['1_AWAITING_OPERATOR_CONFIRMATION'] });
  });

  it('reports refund rate by count and by value separately', () => {
    expect(refundRateByCount(s)).toEqual({ status: 'ok', value: D('0.25') });
    expect(refundRateByValue(s)).toEqual({ status: 'ok', value: D('0.2') });
  });

  it('refuses to sum two currencies', () => {
    const usd = computeBookingFinancials(facts({ bookingId: 'x', currency: 'USD' }));
    expect(() => summarizeFinancials([rows[0], usd])).toThrow(CurrencyMixError);
  });

  it('aggregates report partial coverage instead of treating unknowns as zero', () => {
    const a = aggregate([actual(10), unknown('X', { upperBound: 5 }), actual(1)]);
    expect(a).toMatchObject({ status: 'partial', knownCount: 2, unknownCount: 1, reasons: ['X'] });
    expect(a.known.toString()).toBe('11');
    expect(a.upperBound!.toString()).toBe('16');
    expect(aggregate([unknown('Y')]).status).toBe('unavailable');
  });
});
