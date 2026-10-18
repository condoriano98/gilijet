import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  verify: vi.fn(),
  process: vi.fn(),
  begin: vi.fn(),
  settle: vi.fn(),
  fail: vi.fn(),
  rejected: vi.fn(),
  oversized: vi.fn(),
}));

vi.mock('@/shared/server/env', () => ({ env: { RESEND_INBOUND_SECRET: 'whsec_x' } }));
vi.mock('@/features/messaging/resend-inbound', () => ({ verifyResendWebhook: mocks.verify }));
vi.mock('@/features/tickets/operator-ticket-email', () => ({
  NEEDS_REVIEW_PREFIX: 'Needs review: ',
  OPERATOR_TICKET_EVENT: 'email.received',
  OPERATOR_TICKET_PROVIDER: 'resend-inbound',
  processOperatorTicketEmail: mocks.process,
}));
vi.mock('@/features/payments/webhook-events', () => ({
  beginWebhookEvent: mocks.begin,
  settleWebhookEvent: mocks.settle,
  failWebhookEvent: mocks.fail,
  recordRejectedCallback: mocks.rejected,
  isOversizedWebhookBody: mocks.oversized,
}));

import { POST } from '@/app/api/webhooks/resend-inbound/route';

const req = (body: string) =>
  new NextRequest('http://localhost/api/webhooks/resend-inbound', { method: 'POST', body });

const GOOD = JSON.stringify({ type: 'email.received', data: { email_id: 'em-1' } });

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.verify.mockReturnValue(true);
  mocks.oversized.mockReturnValue(false);
  mocks.begin.mockResolvedValue({ idempotent: false, id: 'ev-1' });
  mocks.process.mockResolvedValue({ ok: true, status: 'forwarded' });
});

describe('POST /api/webhooks/resend-inbound', () => {
  it('rejects a bad signature with 401, logs it, and processes nothing', async () => {
    mocks.verify.mockReturnValue(false);
    const res = await POST(req(GOOD));
    expect(res.status).toBe(401);
    expect(mocks.rejected).toHaveBeenCalledWith(expect.objectContaining({ provider: 'resend-inbound', reason: 'Invalid signature' }));
    expect(mocks.begin).not.toHaveBeenCalled();
    expect(mocks.process).not.toHaveBeenCalled();
  });

  it('refuses an oversized body before reading it', async () => {
    mocks.oversized.mockReturnValue(true);
    expect((await POST(req(GOOD))).status).toBe(413);
    expect(mocks.verify).not.toHaveBeenCalled();
  });

  it('rejects unparseable JSON that carries a valid signature', async () => {
    const res = await POST(req('not json'));
    expect(res.status).toBe(400);
    expect(mocks.rejected).toHaveBeenCalledWith(expect.objectContaining({ reason: 'Invalid JSON' }));
  });

  it('acknowledges other Resend event types without processing', async () => {
    const res = await POST(req(JSON.stringify({ type: 'email.delivered', data: { email_id: 'x' } })));
    expect(res.status).toBe(200);
    expect(mocks.begin).not.toHaveBeenCalled();
  });

  it('keys the event on the Resend email id and forwards a good email', async () => {
    const res = await POST(req(GOOD));
    expect(res.status).toBe(200);
    expect(mocks.begin).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'resend-inbound', eventType: 'email.received', externalRef: 'em-1' }),
    );
    expect(mocks.settle).toHaveBeenCalledWith('ev-1', { ok: true, status: 'forwarded' });
  });

  it('acknowledges a redelivery without processing it again', async () => {
    mocks.begin.mockResolvedValue({ idempotent: true });
    const res = await POST(req(GOOD));
    expect(await res.json()).toEqual({ ok: true, idempotent: true });
    expect(mocks.process).not.toHaveBeenCalled();
  });

  it('answers 200 for an email that needs review, so Resend does not redeliver it', async () => {
    mocks.process.mockResolvedValue({ ok: false, error: 'Needs review: no match' });
    expect((await POST(req(GOOD))).status).toBe(200);
    expect(mocks.settle).toHaveBeenCalled();
  });

  it('answers 500 for a real failure so Resend redelivers, and marks the event failed on a throw', async () => {
    mocks.process.mockResolvedValue({ ok: false, error: 'Resend could not send the forward' });
    expect((await POST(req(GOOD))).status).toBe(500);

    mocks.process.mockRejectedValue(new Error('boom'));
    expect((await POST(req(GOOD))).status).toBe(500);
    expect(mocks.fail).toHaveBeenCalledWith('ev-1', expect.any(Error));
  });
});
