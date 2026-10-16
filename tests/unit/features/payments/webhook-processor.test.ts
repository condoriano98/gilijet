import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  bookingFind: vi.fn(),
  paymentUpdate: vi.fn(),
  paymentUpdateMany: vi.fn(),
  record: vi.fn(),
  notify: vi.fn(),
}));

vi.mock('@/shared/server/db', () => ({
  prisma: {
    booking: { findUnique: mocks.bookingFind },
    payment: { update: mocks.paymentUpdate, updateMany: mocks.paymentUpdateMany },
  },
}));
vi.mock('@/features/tickets/ticket-issuer', () => ({
  recordPaymentAwaitingConfirmation: mocks.record,
}));
vi.mock('@/features/booking/notifications', () => ({
  notifyPaymentReceived: mocks.notify,
}));

import {
  dispatchWebhookEvent,
  processDokuPaymentSuccess,
  processPaypalEvent,
} from '@/features/payments/webhook-processor';
import { BOOKING_NOT_FOUND } from '@/features/payments/webhook-events';

const dokuPayload = (over: Record<string, unknown> = {}) => ({
  order: { invoice_number: 'BK-2026-10-AAAAAA', amount: 450000 },
  transaction: { status: 'SUCCESS' },
  channel: { id: 'VIRTUAL_ACCOUNT_BCA' },
  service: { id: 'SVC-1' },
  ...over,
});

const paypalPayload = (over: Record<string, unknown> = {}) => ({
  id: 'WH-1',
  event_type: 'PAYMENT.CAPTURE.COMPLETED',
  resource: {
    id: 'CAP-1',
    status: 'COMPLETED',
    custom_id: 'BK-2026-10-AAAAAA',
    amount: { value: '28.00', currency_code: 'USD' },
    ...over,
  },
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.notify.mockResolvedValue(undefined);
  mocks.record.mockResolvedValue({ bookingReference: 'x', alreadyRecorded: false });
});

describe('processDokuPaymentSuccess', () => {
  it('records the payment, stores the payload and notifies the customer', async () => {
    mocks.bookingFind.mockResolvedValue({ id: 'bk-1', totalAmount: '450000' });
    const payload = dokuPayload();

    const res = await processDokuPaymentSuccess(payload);

    expect(res).toEqual({ ok: true, status: 'awaiting_confirmation' });
    expect(mocks.record).toHaveBeenCalledWith(
      expect.objectContaining({
        bookingId: 'bk-1',
        method: 'VA_BCA',
        gatewayReference: 'SVC-1',
      }),
    );
    expect(mocks.paymentUpdate).toHaveBeenCalledWith({
      where: { bookingId: 'bk-1' },
      data: { rawWebhookData: payload, failedReason: null },
    });
    expect(mocks.notify).toHaveBeenCalledWith('bk-1');
  });

  it('does not notify again on a redelivery', async () => {
    mocks.bookingFind.mockResolvedValue({ id: 'bk-1', totalAmount: '450000' });
    mocks.record.mockResolvedValue({ bookingReference: 'x', alreadyRecorded: true });

    await processDokuPaymentSuccess(dokuPayload());

    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it('reports an unknown booking as booking-not-found, not as processed', async () => {
    mocks.bookingFind.mockResolvedValue(null);

    const res = await processDokuPaymentSuccess(dokuPayload());

    expect(res).toEqual({ ok: true, status: BOOKING_NOT_FOUND });
    expect(mocks.record).not.toHaveBeenCalled();
  });

  it('refuses a paid amount that differs from the total, with a 409', async () => {
    mocks.bookingFind.mockResolvedValue({ id: 'bk-1', totalAmount: '500000' });

    const res = await processDokuPaymentSuccess(dokuPayload());

    expect(res).toMatchObject({ ok: false, httpStatus: 409 });
    expect(mocks.record).not.toHaveBeenCalled();
  });

  it('falls back to bank transfer for an unknown channel instead of refusing', async () => {
    mocks.bookingFind.mockResolvedValue({ id: 'bk-1', totalAmount: '450000' });

    await processDokuPaymentSuccess(dokuPayload({ channel: { id: 'SOMETHING_NEW' } }));

    expect(mocks.record).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'BANK_TRANSFER' }),
    );
  });

  it('ignores a payload with no invoice number', async () => {
    const res = await processDokuPaymentSuccess({ transaction: { status: 'SUCCESS' } });
    expect(res).toEqual({ ok: true, status: 'ignored' });
    expect(mocks.bookingFind).not.toHaveBeenCalled();
  });
});

describe('processPaypalEvent', () => {
  it('records a completed capture', async () => {
    mocks.bookingFind.mockResolvedValue({
      id: 'bk-1',
      payment: { gatewayReference: 'ORDER-1', presentmentAmount: '28.00', fxRate: '16000' },
    });

    const res = await processPaypalEvent('PAYMENT.CAPTURE.COMPLETED', paypalPayload());

    expect(res).toEqual({ ok: true, status: 'awaiting_confirmation' });
    expect(mocks.record).toHaveBeenCalledWith(
      expect.objectContaining({ bookingId: 'bk-1', method: 'PAYPAL' }),
    );
  });

  it('refuses a capture that differs from the quoted amount', async () => {
    mocks.bookingFind.mockResolvedValue({
      id: 'bk-1',
      payment: { presentmentAmount: '30.00', fxRate: '16000' },
    });

    const res = await processPaypalEvent('PAYMENT.CAPTURE.COMPLETED', paypalPayload());

    expect(res).toMatchObject({ ok: false, httpStatus: 409 });
    expect(mocks.record).not.toHaveBeenCalled();
  });

  it('marks the payment failed on a denied capture and leaves the booking alone', async () => {
    mocks.bookingFind.mockResolvedValue({ id: 'bk-1', payment: {} });

    const res = await processPaypalEvent('PAYMENT.CAPTURE.DENIED', paypalPayload());

    expect(res).toEqual({ ok: true, status: 'failed' });
    expect(mocks.paymentUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: { not: 'SUCCESSFUL' } }),
        data: expect.objectContaining({ status: 'FAILED' }),
      }),
    );
    expect(mocks.record).not.toHaveBeenCalled();
  });

  it('reports an unknown booking as booking-not-found', async () => {
    mocks.bookingFind.mockResolvedValue(null);
    const res = await processPaypalEvent('PAYMENT.CAPTURE.COMPLETED', paypalPayload());
    expect(res).toEqual({ ok: true, status: BOOKING_NOT_FOUND });
  });
});

describe('dispatchWebhookEvent', () => {
  it('re-runs a DOKU payment.success event through the DOKU handler', async () => {
    mocks.bookingFind.mockResolvedValue({ id: 'bk-1', totalAmount: '450000' });

    const res = await dispatchWebhookEvent({
      provider: 'doku',
      eventType: 'payment.success',
      rawPayload: dokuPayload(),
    });

    // The old dispatcher read Xendit fields and answered "ignored" here.
    expect(res).toEqual({ ok: true, status: 'awaiting_confirmation' });
    expect(mocks.record).toHaveBeenCalledTimes(1);
  });

  it('routes PayPal capture events to the PayPal handler', async () => {
    mocks.bookingFind.mockResolvedValue({
      id: 'bk-1',
      payment: { presentmentAmount: '28.00', fxRate: '16000' },
    });

    const res = await dispatchWebhookEvent({
      provider: 'paypal',
      eventType: 'PAYMENT.CAPTURE.COMPLETED',
      rawPayload: paypalPayload(),
    });

    expect(res).toMatchObject({ ok: true });
    expect(mocks.record).toHaveBeenCalledTimes(1);
  });

  it('fails, rather than succeeding silently, for an event nothing handles', async () => {
    const res = await dispatchWebhookEvent({
      provider: 'doku',
      eventType: 'signature.rejected',
      rawPayload: {},
    });

    expect(res).toMatchObject({ ok: false });
  });
});
