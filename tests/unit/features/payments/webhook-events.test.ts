import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  count: vi.fn(),
}));

vi.mock('@/shared/server/db', () => ({
  prisma: {
    webhookEvent: {
      findFirst: mocks.findFirst,
      create: mocks.create,
      update: mocks.update,
      count: mocks.count,
    },
  },
}));

import {
  BOOKING_NOT_FOUND,
  beginWebhookEvent,
  failWebhookEvent,
  isOversizedWebhookBody,
  isRetryableEvent,
  recordRejectedCallback,
  settleWebhookEvent,
} from '@/features/payments/webhook-events';

const args = {
  provider: 'doku',
  eventType: 'payment.success',
  externalRef: 'BK-2026-10-AAAAAA',
  payload: { a: 1 },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.update.mockResolvedValue({});
  mocks.create.mockResolvedValue({ id: 'ev-new' });
  mocks.count.mockResolvedValue(0);
});

describe('beginWebhookEvent', () => {
  it.each(['PROCESSED', 'PROCESSING'])('is idempotent for a %s event', async (status) => {
    mocks.findFirst.mockResolvedValue({ id: 'ev-1', status, lastAttemptAt: new Date() });
    expect(await beginWebhookEvent(args)).toEqual({ idempotent: true });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('reopens a PROCESSING event that has been stuck past the timeout', async () => {
    mocks.findFirst.mockResolvedValue({
      id: 'ev-1',
      status: 'PROCESSING',
      lastAttemptAt: new Date(Date.now() - 10 * 60 * 1000),
    });
    expect(await beginWebhookEvent(args)).toEqual({ idempotent: false, id: 'ev-1' });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('reuses a FAILED event and counts the new attempt', async () => {
    mocks.findFirst.mockResolvedValue({ id: 'ev-1', status: 'FAILED' });

    const res = await beginWebhookEvent(args);

    expect(res).toEqual({ idempotent: false, id: 'ev-1' });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ev-1' },
        data: expect.objectContaining({
          status: 'PROCESSING',
          attempts: { increment: 1 },
        }),
      }),
    );
  });

  it('creates a PROCESSING event the first time', async () => {
    mocks.findFirst.mockResolvedValue(null);
    expect(await beginWebhookEvent(args)).toEqual({ idempotent: false, id: 'ev-new' });
    expect(mocks.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: 'PROCESSING', attempts: 1 }),
    });
  });
});

describe('settleWebhookEvent', () => {
  it('marks an ok result PROCESSED and clears the error', async () => {
    await settleWebhookEvent('ev-1', { ok: true, status: 'awaiting_confirmation' });
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: 'ev-1' },
      data: expect.objectContaining({ status: 'PROCESSED', errorMessage: null }),
    });
  });

  it('marks an unknown booking SKIPPED', async () => {
    await settleWebhookEvent('ev-1', { ok: true, status: BOOKING_NOT_FOUND });
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: 'ev-1' },
      data: expect.objectContaining({ status: 'SKIPPED' }),
    });
  });

  it('marks a failed result FAILED with its error', async () => {
    await settleWebhookEvent('ev-1', { ok: false, error: 'Amount mismatch' });
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: 'ev-1' },
      data: { status: 'FAILED', errorMessage: 'Amount mismatch' },
    });
  });
});

describe('failWebhookEvent', () => {
  it('records the thrown message and never throws itself', async () => {
    mocks.update.mockRejectedValue(new Error('db down'));
    await expect(failWebhookEvent('ev-1', new Error('boom'))).resolves.toBeUndefined();
  });
});

describe('recordRejectedCallback', () => {
  it('logs a rejected callback as FAILED and pulls the booking reference from the body', async () => {
    await recordRejectedCallback({
      provider: 'doku',
      reason: 'Invalid signature',
      rawBody: '{"order":{"invoice_number":"BK-2026-10-AAAAAA"}}',
    });

    expect(mocks.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        provider: 'doku',
        eventType: 'signature.rejected',
        externalRef: 'BK-2026-10-AAAAAA',
        status: 'FAILED',
        errorMessage: 'Invalid signature',
      }),
    });
  });

  it('truncates a large body', async () => {
    await recordRejectedCallback({
      provider: 'paypal',
      reason: 'Invalid signature',
      rawBody: 'x'.repeat(10_000),
    });

    const data = mocks.create.mock.calls[0][0].data;
    expect(data.rawPayload.body).toHaveLength(4096);
    expect(data.rawPayload.truncated).toBe(true);
    expect(data.externalRef).toBe('unknown');
  });

  it('stops logging once the rate limit is reached', async () => {
    mocks.count.mockResolvedValue(50);
    await recordRejectedCallback({ provider: 'doku', reason: 'x', rawBody: '{}' });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('never throws, so the gateway still gets its answer', async () => {
    mocks.create.mockRejectedValue(new Error('db down'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(
      recordRejectedCallback({ provider: 'doku', reason: 'x', rawBody: '{}' }),
    ).resolves.toBeUndefined();
    spy.mockRestore();
  });
});

describe('isRetryableEvent', () => {
  it('retries payment events and nothing that is only a record', () => {
    expect(isRetryableEvent('doku', 'payment.success')).toBe(true);
    expect(isRetryableEvent('paypal', 'PAYMENT.CAPTURE.COMPLETED')).toBe(true);
    expect(isRetryableEvent('doku', 'payment.failed')).toBe(false);
    expect(isRetryableEvent('doku', 'signature.rejected')).toBe(false);
    expect(isRetryableEvent('xendit', 'payment.success')).toBe(false);
  });
});

describe('isOversizedWebhookBody', () => {
  it('rejects a content-length above the cap', () => {
    expect(isOversizedWebhookBody(new Headers({ 'content-length': String(256 * 1024 + 1) }))).toBe(true);
  });

  it('accepts normal and missing content-length', () => {
    expect(isOversizedWebhookBody(new Headers({ 'content-length': '2048' }))).toBe(false);
    expect(isOversizedWebhookBody(new Headers())).toBe(false);
  });
});
