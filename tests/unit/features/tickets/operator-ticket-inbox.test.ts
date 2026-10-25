import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  env: { INBOX_POLL_LIVE: false } as Record<string, unknown>,
  configured: vi.fn(),
  open: vi.fn(),
  parse: vi.fn(),
  process: vi.fn(),
  picFind: vi.fn(),
  eventFind: vi.fn(),
  begin: vi.fn(),
  settle: vi.fn(),
  fail: vi.fn(),
  client: {
    connect: vi.fn(),
    logout: vi.fn(),
    getMailboxLock: vi.fn(),
    search: vi.fn(),
    fetchOne: vi.fn(),
    fetch: vi.fn(),
    mailbox: { uidValidity: BigInt(77) },
  },
  release: vi.fn(),
}));

vi.mock('@/shared/server/env', () => ({ env: mocks.env }));
vi.mock('@/shared/server/db', () => ({
  prisma: { operatorPicContact: { findMany: mocks.picFind }, webhookEvent: { findMany: mocks.eventFind } },
}));
vi.mock('@/features/messaging/inbox', () => ({
  MAX_MESSAGE_BYTES: 15 * 1024 * 1024,
  inboxConfigured: mocks.configured,
  openInbox: mocks.open,
  parseRawEmail: mocks.parse,
}));
vi.mock('@/features/tickets/operator-ticket-email', () => ({
  NEEDS_REVIEW_PREFIX: 'Needs review: ',
  OPERATOR_TICKET_EVENT: 'email.received',
  OPERATOR_TICKET_PROVIDER: 'imap-inbox',
  processOperatorTicketEmail: mocks.process,
}));
vi.mock('@/features/payments/webhook-events', () => ({
  beginWebhookEvent: mocks.begin,
  settleWebhookEvent: mocks.settle,
  failWebhookEvent: mocks.fail,
}));

import { pollOperatorInbox } from '@/features/tickets/operator-ticket-inbox';

const envelope = (uid: number, over: Record<string, unknown> = {}) => ({
  uid,
  envelope: { messageId: `<m${uid}@w>`, subject: `S${uid}`, from: [{ address: 'No-Reply@Wahana.com' }] },
  size: 1000,
  ...over,
});

/** What the ranged envelope fetch returns for a "5,6,7" uid range. */
const envelopes = (make: (uid: number) => unknown = (uid) => envelope(uid)) =>
  mocks.client.fetch.mockImplementation((range: string) =>
    (async function* () {
      for (const uid of range.split(',').map(Number)) yield make(uid);
    })(),
  );

beforeEach(() => {
  vi.clearAllMocks();
  mocks.env.INBOX_POLL_LIVE = false;
  mocks.configured.mockReturnValue(true);
  mocks.open.mockReturnValue(mocks.client);
  mocks.client.connect.mockResolvedValue(undefined);
  mocks.client.logout.mockResolvedValue(undefined);
  mocks.client.getMailboxLock.mockResolvedValue({ release: mocks.release });
  mocks.client.search.mockResolvedValue([5, 6]);
  mocks.client.fetchOne.mockResolvedValue({ source: Buffer.from('raw') });
  envelopes();
  mocks.picFind.mockResolvedValue([{ emailKonfirmasiTrigger: ' No-Reply@Wahana.com ' }, { emailKonfirmasiTrigger: 'no-reply@wahana.com' }]);
  mocks.eventFind.mockResolvedValue([]);
  mocks.parse.mockResolvedValue({ id: 'x', from: 'no-reply@wahana.com' });
  mocks.process.mockResolvedValue({ ok: true, status: 'forwarded' });
  mocks.begin.mockResolvedValue({ idempotent: false, id: 'ev-1' });
});

describe('pollOperatorInbox', () => {
  it('does nothing, and does not connect, when IMAP is not configured', async () => {
    mocks.configured.mockReturnValue(false);
    const s = await pollOperatorInbox();
    expect(s.configured).toBe(false);
    expect(mocks.open).not.toHaveBeenCalled();
  });

  it('does nothing when no operator has a confirmation address', async () => {
    mocks.picFind.mockResolvedValue([]);
    const s = await pollOperatorInbox();
    expect(s.senders).toBe(0);
    expect(mocks.open).not.toHaveBeenCalled();
  });

  it('searches each distinct sender once, lower-cased, over the last 7 days, read-only', async () => {
    const now = new Date('2026-10-20T10:00:00Z');
    await pollOperatorInbox({ now });
    expect(mocks.client.search).toHaveBeenCalledTimes(1);
    expect(mocks.client.search).toHaveBeenCalledWith(
      { since: new Date('2026-10-13T10:00:00Z'), from: 'no-reply@wahana.com' },
      { uid: true },
    );
    expect(mocks.client.getMailboxLock).toHaveBeenCalledWith('INBOX', { readOnly: true });
    expect(mocks.release).toHaveBeenCalled();
    expect(mocks.client.logout).toHaveBeenCalled();
  });

  describe('dry run (the default)', () => {
    it('reports what it would do and writes nothing', async () => {
      mocks.process.mockResolvedValue({ ok: true, status: 'dry-run: would forward to booking BK-1 (matched by code)' });
      const s = await pollOperatorInbox();
      expect(s.dryRun).toBe(true);
      expect(s.forwarded).toBe(2);
      expect(mocks.process).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ dryRun: true }));
      expect(mocks.begin).not.toHaveBeenCalled();
      expect(mocks.settle).not.toHaveBeenCalled();
    });

    it('INBOX_POLL_LIVE must be exactly true to leave dry-run', async () => {
      mocks.env.INBOX_POLL_LIVE = true;
      expect((await pollOperatorInbox()).dryRun).toBe(false);
    });
  });

  describe('live', () => {
    const live = { live: true };

    it('opens an event per new mail, processes it with the mail in hand, and settles it', async () => {
      const s = await pollOperatorInbox(live);
      expect(s.dryRun).toBe(false);
      expect(s.forwarded).toBe(2);
      expect(mocks.begin).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: 'imap-inbox',
          eventType: 'email.received',
          externalRef: '<m5@w>',
          payload: { type: 'email.received', data: { email_id: '<m5@w>', from: 'no-reply@wahana.com', subject: 'S5', imap: { uidValidity: '77', uid: 5 } } },
        }),
      );
      expect(mocks.process).toHaveBeenCalledWith(expect.anything(), { email: expect.anything() });
      expect(mocks.settle).toHaveBeenCalledTimes(2);
    });

    it('skips mail that already has an event, without downloading its body', async () => {
      mocks.eventFind.mockResolvedValue([{ externalRef: '<m5@w>' }]);
      const s = await pollOperatorInbox(live);
      expect(s.candidates).toBe(1);
      expect(mocks.client.fetchOne).toHaveBeenCalledTimes(1);
      expect(mocks.client.fetchOne.mock.calls[0][0]).toBe('6');
    });

    it('never sets IMAP flags: the mailbox is not modified', async () => {
      await pollOperatorInbox(live);
      expect((mocks.client as Record<string, unknown>).messageFlagsAdd).toBeUndefined();
    });

    it('counts "needs review" and failures separately and keeps going', async () => {
      mocks.process
        .mockResolvedValueOnce({ ok: false, error: 'Needs review: No PDF attached' })
        .mockResolvedValueOnce({ ok: false, error: 'The mail server could not send the forward' });
      const s = await pollOperatorInbox(live);
      expect(s).toMatchObject({ needsReview: 1, failed: 1, forwarded: 0 });
      expect(mocks.settle).toHaveBeenCalledTimes(2);
    });

    it('marks the event failed when the processor throws, and continues with the next mail', async () => {
      mocks.process.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce({ ok: true, status: 'forwarded' });
      const s = await pollOperatorInbox(live);
      expect(mocks.fail).toHaveBeenCalledWith('ev-1', expect.any(Error));
      expect(s).toMatchObject({ failed: 1, forwarded: 1 });
    });

    it('leaves an event that is already being processed alone', async () => {
      mocks.begin.mockResolvedValue({ idempotent: true });
      const s = await pollOperatorInbox(live);
      expect(mocks.process).not.toHaveBeenCalled();
      expect(s.skipped).toBe(2);
    });

    it('logs an oversized message as needs review without downloading it', async () => {
      envelopes((uid) => envelope(uid, { size: 20 * 1024 * 1024 }));
      const s = await pollOperatorInbox(live);
      expect(s.needsReview).toBe(2);
      expect(mocks.client.fetchOne).not.toHaveBeenCalled();
      expect(mocks.settle).toHaveBeenCalledWith('ev-1', { ok: false, error: 'Needs review: Message is larger than 15 MB' });
    });

    it('puts a message that cannot be parsed on the review list instead of re-reading it every poll', async () => {
      mocks.parse.mockRejectedValue(new Error('Attachments are larger than 12 MB'));
      const s = await pollOperatorInbox(live);
      expect(s).toMatchObject({ needsReview: 2, failed: 0 });
      expect(mocks.settle).toHaveBeenCalledWith('ev-1', {
        ok: false,
        error: 'Needs review: Could not read the message: Attachments are larger than 12 MB',
      });
      expect(mocks.process).not.toHaveBeenCalled();
    });

    it('only looks at the newest 100 messages and stops reading envelopes at the budget', async () => {
      mocks.client.search.mockResolvedValue(Array.from({ length: 250 }, (_, i) => i + 1));
      await pollOperatorInbox({ live: true });
      expect(mocks.client.fetch).toHaveBeenCalledTimes(1);
      const range = mocks.client.fetch.mock.calls[0][0] as string;
      expect(range.split(',')).toHaveLength(100);
      expect(range.startsWith('151,')).toBe(true);
    });

    it('drops mail whose From is not exactly an operator address, however the IMAP substring search matched it', async () => {
      envelopes((uid) =>
        envelope(uid, {
          envelope: {
            messageId: `<m${uid}@w>`,
            subject: 'x',
            from: uid === 5 ? [{ address: 'no-reply@wahana.com.evil.net' }] : [{ address: 'no-reply@wahana.com' }, { address: 'x@evil.test' }],
          },
        }),
      );
      const s = await pollOperatorInbox(live);
      expect(s.candidates).toBe(0);
      expect(mocks.begin).not.toHaveBeenCalled();
      expect(mocks.client.fetchOne).not.toHaveBeenCalled();
    });

    it('with INBOX_POLL_SINCE only looks at mail that arrived on or after that day (WITA), by arrival time', async () => {
      mocks.env.INBOX_POLL_SINCE = '2026-10-20';
      const now = new Date('2026-10-20T10:00:00Z');
      envelopes((uid) =>
        envelope(uid, {
          // uid 5 arrived 19 Oct 23:30 WITA (before the cut), uid 6 on 20 Oct 08:00 WITA.
          internalDate: uid === 5 ? new Date('2026-10-19T15:30:00Z') : new Date('2026-10-20T00:00:00Z'),
        }),
      );
      const s = await pollOperatorInbox({ live: true, now });
      expect(mocks.client.search).toHaveBeenCalledWith(
        { since: new Date('2026-10-19T16:00:00Z'), from: 'no-reply@wahana.com' },
        { uid: true },
      );
      expect(s.candidates).toBe(1);
      expect(mocks.begin.mock.calls[0][0].externalRef).toBe('<m6@w>');
      delete mocks.env.INBOX_POLL_SINCE;
    });

    it('INBOX_POLL_SINCE never reaches further back than the 7 day window', async () => {
      mocks.env.INBOX_POLL_SINCE = '2026-01-01';
      await pollOperatorInbox({ now: new Date('2026-10-20T10:00:00Z') });
      expect(mocks.client.search.mock.calls[0][0].since).toEqual(new Date('2026-10-13T10:00:00Z'));
      delete mocks.env.INBOX_POLL_SINCE;
    });

    it('bounds a sender-controlled Message-ID before it is stored', async () => {
      envelopes((uid) => envelope(uid, { envelope: { messageId: `<${'a'.repeat(900)}>`, subject: 's', from: [{ address: 'no-reply@wahana.com' }] } }));
      await pollOperatorInbox(live);
      expect(mocks.begin.mock.calls[0][0].externalRef.length).toBe(200);
    });

    it('stops at the time budget', async () => {
      const s = await pollOperatorInbox({ live: true, budgetMs: -1 });
      expect(s.items).toHaveLength(0);
      expect(mocks.process).not.toHaveBeenCalled();
    });
  });

  it('always logs out, even when the search fails, and rethrows so the route is loud', async () => {
    mocks.client.search.mockRejectedValue(new Error('IMAP down'));
    await expect(pollOperatorInbox()).rejects.toThrow('IMAP down');
    expect(mocks.release).toHaveBeenCalled();
    expect(mocks.client.logout).toHaveBeenCalled();
  });

  it('a failed login is thrown, not an empty run', async () => {
    mocks.client.connect.mockRejectedValue(new Error('AUTHENTICATIONFAILED'));
    await expect(pollOperatorInbox()).rejects.toThrow('AUTHENTICATIONFAILED');
  });
});
