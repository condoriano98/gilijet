import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  updateMany: vi.fn(),
  dispatch: vi.fn(),
  settle: vi.fn(),
  fail: vi.fn(),
}));

vi.mock('@/shared/server/env', () => ({ env: { CRON_SECRET: 'cron-secret' } }));
vi.mock('@/shared/server/db', () => ({
  prisma: { webhookEvent: { findMany: mocks.findMany, updateMany: mocks.updateMany } },
}));
vi.mock('@/features/payments/webhook-processor', () => ({
  dispatchWebhookEvent: mocks.dispatch,
}));
vi.mock('@/features/payments/webhook-events', async (orig) => ({
  ...(await orig<typeof import('@/features/payments/webhook-events')>()),
  settleWebhookEvent: mocks.settle,
  failWebhookEvent: mocks.fail,
}));

import { GET } from '@/app/api/cron/retry-webhooks/route';

const req = (auth?: string) =>
  new NextRequest('http://localhost/api/cron/retry-webhooks', {
    headers: auth ? { authorization: auth } : {},
  });

const event = (over: Record<string, unknown> = {}) => ({
  id: 'ev-1',
  provider: 'doku',
  eventType: 'payment.success',
  rawPayload: { order: { invoice_number: 'BK-2026-10-AAAAAA' } },
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.updateMany.mockResolvedValue({ count: 1 });
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

describe('GET /api/cron/retry-webhooks', () => {
  it('rejects a request without the cron secret', async () => {
    const res = await GET(req('Bearer wrong'));
    expect(res.status).toBe(401);
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it('selects DOKU and PayPal payment events, never signature.rejected', async () => {
    mocks.findMany.mockResolvedValue([]);

    await GET(req('Bearer cron-secret'));

    const where = mocks.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual(
      expect.arrayContaining([
        { provider: 'doku', eventType: { in: ['payment.success'] } },
        expect.objectContaining({ provider: 'paypal' }),
      ]),
    );
    expect(JSON.stringify(where)).not.toContain('signature.rejected');
  });

  it('skips an event another run already claimed', async () => {
    mocks.findMany.mockResolvedValue([event()]);
    mocks.updateMany.mockResolvedValue({ count: 0 });

    const res = await GET(req('Bearer cron-secret'));

    expect(mocks.dispatch).not.toHaveBeenCalled();
    expect(await res.json()).toMatchObject({ processed: 0, failed: 0, total: 1 });
  });

  it('runs the stored event through the dispatcher and settles it', async () => {
    mocks.findMany.mockResolvedValue([event()]);
    mocks.dispatch.mockResolvedValue({ ok: true, status: 'awaiting_confirmation' });

    const res = await GET(req('Bearer cron-secret'));

    expect(mocks.dispatch).toHaveBeenCalledWith(expect.objectContaining({ id: 'ev-1' }));
    expect(mocks.settle).toHaveBeenCalledWith('ev-1', {
      ok: true,
      status: 'awaiting_confirmation',
    });
    expect(await res.json()).toMatchObject({ processed: 1, failed: 0 });
  });

  it('counts a failing event and leaves it FAILED for the next run', async () => {
    mocks.findMany.mockResolvedValue([event()]);
    mocks.dispatch.mockResolvedValue({ ok: false, error: 'Amount mismatch' });

    const res = await GET(req('Bearer cron-secret'));

    expect(mocks.settle).toHaveBeenCalledWith('ev-1', {
      ok: false,
      error: 'Amount mismatch',
    });
    expect(await res.json()).toMatchObject({ processed: 0, failed: 1 });
  });

  it('survives a handler that throws and marks the event failed', async () => {
    mocks.findMany.mockResolvedValue([event(), event({ id: 'ev-2' })]);
    mocks.dispatch
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ ok: true, status: 'x' });

    const res = await GET(req('Bearer cron-secret'));

    expect(mocks.fail).toHaveBeenCalledWith('ev-1', expect.any(Error));
    expect(await res.json()).toMatchObject({ processed: 1, failed: 1, total: 2 });
  });
});
