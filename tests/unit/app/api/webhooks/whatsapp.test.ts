import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  env: { WHATSAPP_WEBHOOK_VERIFY_TOKEN: 'tok', WHATSAPP_APP_SECRET: 's3cret' } as Record<string, string | undefined>,
  begin: vi.fn(),
  settle: vi.fn(),
  fail: vi.fn(),
  rejected: vi.fn(),
}));

vi.mock('@/shared/server/env', () => ({ env: mocks.env }));
vi.mock('@/features/payments/webhook-events', () => ({
  beginWebhookEvent: mocks.begin,
  settleWebhookEvent: mocks.settle,
  failWebhookEvent: mocks.fail,
  recordRejectedCallback: mocks.rejected,
  isOversizedWebhookBody: () => false,
}));

import { GET, POST } from '@/app/api/webhooks/whatsapp/route';

const URL_ = 'http://localhost/api/webhooks/whatsapp';
const sign = (body: string) => 'sha256=' + createHmac('sha256', 's3cret').update(body).digest('hex');
const post = (body: string, sig?: string) =>
  new NextRequest(URL_, {
    method: 'POST',
    body,
    headers: sig ? { 'x-hub-signature-256': sig } : {},
  });
const statusBody = (status: string, error?: object) =>
  JSON.stringify({
    entry: [{ changes: [{ value: { statuses: [{ id: 'wamid.A', status, timestamp: '1', ...(error ? { errors: [error] } : {}) }] } }] }],
  });

beforeEach(() => {
  Object.values(mocks).forEach((m) => typeof m === 'function' && 'mockReset' in m && m.mockReset());
  mocks.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = 'tok';
  mocks.env.WHATSAPP_APP_SECRET = 's3cret';
  mocks.begin.mockResolvedValue({ idempotent: false, id: 'evt-1' });
  mocks.settle.mockResolvedValue(undefined);
});

describe('GET /api/webhooks/whatsapp (Meta verification)', () => {
  const get = (q: string) => new NextRequest(`${URL_}?${q}`);

  it('answers the challenge as plain text when the token matches', async () => {
    const res = await GET(get('hub.mode=subscribe&hub.verify_token=tok&hub.challenge=777'));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('777');
  });

  it('403 on a wrong token, 503 when no token is configured', async () => {
    expect((await GET(get('hub.mode=subscribe&hub.verify_token=x&hub.challenge=1'))).status).toBe(403);
    mocks.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = undefined;
    expect((await GET(get('hub.mode=subscribe&hub.verify_token=tok&hub.challenge=1'))).status).toBe(503);
  });
});

describe('POST /api/webhooks/whatsapp', () => {
  it('rejects a bad signature, records it, and does not touch events', async () => {
    const res = await POST(post(statusBody('delivered'), 'sha256=deadbeef'));
    expect(res.status).toBe(401);
    expect(mocks.rejected).toHaveBeenCalledWith(expect.objectContaining({ provider: 'whatsapp', reason: 'Invalid signature' }));
    expect(mocks.begin).not.toHaveBeenCalled();
  });

  it('503 when the app secret is not configured', async () => {
    mocks.env.WHATSAPP_APP_SECRET = undefined;
    const body = statusBody('delivered');
    expect((await POST(post(body, sign(body)))).status).toBe(503);
  });

  it('logs a delivered status as recorded', async () => {
    const body = statusBody('delivered');
    const res = await POST(post(body, sign(body)));
    expect(res.status).toBe(200);
    expect(mocks.begin).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'whatsapp', eventType: 'message.delivered', externalRef: 'wamid.A' }),
    );
    expect(mocks.settle).toHaveBeenCalledWith('evt-1', { ok: true, status: 'recorded' });
  });

  it('logs a failed status as FAILED with Meta\'s reason', async () => {
    const body = statusBody('failed', { code: 131026, title: 'Message undeliverable' });
    await POST(post(body, sign(body)));
    expect(mocks.settle).toHaveBeenCalledWith('evt-1', { ok: false, error: '131026 Message undeliverable' });
  });

  it('skips a status already logged', async () => {
    mocks.begin.mockResolvedValue({ idempotent: true });
    const body = statusBody('read');
    expect((await POST(post(body, sign(body)))).status).toBe(200);
    expect(mocks.settle).not.toHaveBeenCalled();
  });

  it('still answers 200 when the bookkeeping throws (Meta must not retry-storm)', async () => {
    mocks.begin.mockRejectedValue(new Error('db down'));
    const body = statusBody('sent');
    expect((await POST(post(body, sign(body)))).status).toBe(200);
  });

  it('400 on invalid JSON with a valid signature', async () => {
    const body = 'not json';
    expect((await POST(post(body, sign(body)))).status).toBe(400);
    expect(mocks.rejected).toHaveBeenCalledWith(expect.objectContaining({ reason: 'Invalid JSON' }));
  });
});
