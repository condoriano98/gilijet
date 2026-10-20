import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ env: {} as Record<string, unknown>, poll: vi.fn() }));
vi.mock('@/shared/server/env', () => ({ env: mocks.env }));
vi.mock('@/features/tickets/operator-ticket-inbox', () => ({ pollOperatorInbox: mocks.poll }));

import { GET } from '@/app/api/cron/poll-operator-inbox/route';

const call = (auth?: string) =>
  GET(new NextRequest('http://localhost/api/cron/poll-operator-inbox', { headers: auth ? { authorization: auth } : {} }));

beforeEach(() => {
  mocks.poll.mockReset();
  mocks.env.CRON_SECRET = 's3cret';
});

describe('GET /api/cron/poll-operator-inbox', () => {
  it('rejects a missing or wrong secret and never polls', async () => {
    expect((await call()).status).toBe(401);
    expect((await call('Bearer nope')).status).toBe(401);
    expect(mocks.poll).not.toHaveBeenCalled();
  });

  it('rejects everything when CRON_SECRET is not set', async () => {
    delete mocks.env.CRON_SECRET;
    expect((await call('Bearer undefined')).status).toBe(401);
    expect(mocks.poll).not.toHaveBeenCalled();
  });

  it('returns the counts only: no sender, subject or customer name leaves in the default response', async () => {
    mocks.poll.mockResolvedValue({
      configured: true, dryRun: true, forwarded: 1, needsReview: 0, skipped: 0, failed: 0, candidates: 1,
      items: [{ uid: 1, from: 'no-reply@wahana.com', subject: 'Ticket for Andy', outcome: 'Needs review: no paid booking matches "Andy"' }],
    });
    const res = await call('Bearer s3cret');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, dryRun: true, forwarded: 1 });
    expect(JSON.stringify(body)).not.toMatch(/Andy|wahana/);
  });

  it('adds the per-message detail only when asked with ?detail=1 and the secret', async () => {
    mocks.poll.mockResolvedValue({ configured: true, dryRun: true, forwarded: 0, needsReview: 1, skipped: 0, failed: 0, candidates: 1, items: [{ uid: 1, from: 'a@b.c', subject: 's', outcome: 'o' }] });
    const res = await GET(new NextRequest('http://localhost/api/cron/poll-operator-inbox?detail=1', { headers: { authorization: 'Bearer s3cret' } }));
    expect((await res.json()).items).toHaveLength(1);
  });

  it('answers 500 when the mailbox cannot be reached, so the failure is visible', async () => {
    mocks.poll.mockRejectedValue(new Error('AUTHENTICATIONFAILED'));
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = await call('Bearer s3cret');
    err.mockRestore();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: 'Poll failed' });
  });
});
