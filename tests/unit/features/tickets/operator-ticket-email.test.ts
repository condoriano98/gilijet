import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  picFind: vi.fn(),
  bookingFindFirst: vi.fn(),
  bookingFindMany: vi.fn(),
  auditFindFirst: vi.fn(),
  auditCreate: vi.fn(),
  auditDelete: vi.fn(),
  auditUpdate: vi.fn(),
  configured: vi.fn(),
  load: vi.fn(),
  send: vi.fn(),
}));

vi.mock('@/shared/server/db', () => ({
  prisma: {
    operatorPicContact: { findMany: mocks.picFind },
    booking: { findFirst: mocks.bookingFindFirst, findMany: mocks.bookingFindMany },
    auditLog: { findFirst: mocks.auditFindFirst, create: mocks.auditCreate, delete: mocks.auditDelete, update: mocks.auditUpdate },
  },
}));
vi.mock('@/features/messaging/mailer', () => ({ mailConfigured: mocks.configured }));
vi.mock('@/features/messaging/inbox', () => ({
  loadReceivedEmail: mocks.load,
  MessageGoneError: class MessageGoneError extends Error {},
}));
vi.mock('@/features/messaging/email', () => ({ sendOperatorTicketForward: mocks.send }));

import { processOperatorTicketEmail } from '@/features/tickets/operator-ticket-email';
import { SENDER_NOT_ALLOWED } from '@/features/payments/webhook-events';
import { MessageGoneError } from '@/features/messaging/inbox';

const DEPARTURE = new Date('2027-07-21T23:00:00Z'); // 22 Jul 2027 07:00 WITA
const leg = { departureDate: DEPARTURE };

const booking = (over: Record<string, unknown> = {}) => ({
  id: 'bk-1',
  bookingReference: 'BK-2026-10-ABC234',
  customerName: 'Andy Buyer',
  customerEmail: 'andy@example.com',
  notes: JSON.stringify({ passengers: [{ name: 'Andy Buyer' }, { name: 'Sita Friend' }] }),
  tripType: 'ONE_WAY',
  operatorId: 'op-1',
  status: 'AWAITING_CONFIRMATION',
  leg,
  outboundLeg: null,
  returnLeg: null,
  ...over,
});

const email = (over: Record<string, unknown> = {}) => ({
  id: 'em-1',
  from: 'Wahana <no-reply@virendrafastferry.com>',
  subject: 'Fwd: E-Ticket Wahana',
  messageId: '<m1@wahana>',
  text: 'Hi Andy Buyer BK-2026-10-ABC234,\nSanur → Nusa Penida · 22 Jul 2027 07:00',
  html: null,
  attachments: [{ filename: 'ticket.pdf', content: Buffer.from('%PDF-1.4 x') }],
  authenticated: true,
  ...over,
});

const payload = { type: 'email.received', data: { email_id: 'em-1' } };

beforeEach(() => {
  Object.values(mocks).forEach((m) => typeof m === 'function' && m.mockReset());
  mocks.picFind.mockResolvedValue([{ operatorId: 'op-1', emailKonfirmasiTrigger: 'No-Reply@VirendraFastFerry.com' }]);
  mocks.load.mockResolvedValue(email());
  mocks.bookingFindFirst.mockResolvedValue(booking());
  mocks.bookingFindMany.mockResolvedValue([]);
  mocks.auditFindFirst.mockResolvedValue(null);
  mocks.auditCreate.mockResolvedValue({ id: 'claim-1' });
  mocks.auditDelete.mockResolvedValue({});
  mocks.auditUpdate.mockResolvedValue({});
  mocks.configured.mockReturnValue(true);
  mocks.send.mockResolvedValue({ delivered: true, provider: 'smtp' });
});

describe('sender check', () => {
  it('ignores mail from an address that is not an operator confirmation address', async () => {
    mocks.load.mockResolvedValue(email({ from: 'stranger@evil.test' }));
    const r = await processOperatorTicketEmail(payload);
    expect(r).toEqual({ ok: true, status: SENDER_NOT_ALLOWED });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('does not trust a From: line typed into the body', async () => {
    mocks.load.mockResolvedValue(
      email({
        from: 'attacker@evil.test',
        text: '---------- Forwarded message ---------\nFrom: no-reply@virendrafastferry.com\nSubject: E-Ticket\n\nHi Andy Buyer BK-2026-10-ABC234,',
      }),
    );
    expect(await processOperatorTicketEmail(payload)).toEqual({ ok: true, status: SENDER_NOT_ALLOWED });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('refuses an attachment that is not a PDF', async () => {
    mocks.load.mockResolvedValue(email({ attachments: [{ filename: 'x.pdf', content: Buffer.from('MZ-not-pdf') }] }));
    const r = await processOperatorTicketEmail(payload);
    expect(!r.ok && r.error).toMatch(/not a PDF/);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('sends nothing when the email has no attachment at all (needs review)', async () => {
    mocks.load.mockResolvedValue(email({ attachments: [] }));
    const r = await processOperatorTicketEmail(payload);
    expect(!r.ok && r.error).toBe('Needs review: No PDF attached');
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });

  it('sends nothing when the receiving server did not authenticate the sender (needs review)', async () => {
    mocks.load.mockResolvedValue(email({ authenticated: false }));
    const r = await processOperatorTicketEmail(payload);
    expect(!r.ok && r.error).toMatch(/^Needs review: The sender could not be verified/);
    expect(mocks.send).not.toHaveBeenCalled();
  });
});

describe('re-reading the message', () => {
  it('keeps a message that is gone from the mailbox on the review list, with the reason', async () => {
    mocks.load.mockRejectedValue(new MessageGoneError('The message is no longer in the mailbox'));
    const r = await processOperatorTicketEmail(payload);
    expect(!r.ok && r.error).toBe('Needs review: The message is no longer in the mailbox');
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('lets any other read error through, so the event is retried', async () => {
    mocks.load.mockRejectedValue(new Error('IMAP timeout'));
    await expect(processOperatorTicketEmail(payload)).rejects.toThrow('IMAP timeout');
  });
});

describe('match by booking code', () => {
  it('forwards to the buyer with the cleaned subject, and writes the audit row', async () => {
    const r = await processOperatorTicketEmail(payload);
    expect(r).toEqual({ ok: true, status: 'forwarded' });
    expect(mocks.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'andy@example.com',
        subject: 'E-Ticket Wahana',
        bookingReference: 'BK-2026-10-ABC234',
      }),
    );
    expect(mocks.auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({
        entityId: 'bk-1',
        action: 'operator_ticket_forwarded',
        userRole: 'SYSTEM',
        newState: expect.objectContaining({ matchedBy: 'code', messageId: '<m1@wahana>', leg: 'one-way' }),
      }) }),
    );
  });

  it('looks the code up only among paid bookings of the sender operator', async () => {
    await processOperatorTicketEmail(payload);
    expect(mocks.bookingFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          bookingReference: 'BK-2026-10-ABC234',
          operatorId: { in: ['op-1'] },
          status: { in: ['AWAITING_CONFIRMATION', 'CONFIRMED'] },
        },
      }),
    );
  });

  it('does not guess when the code matches no booking of this operator', async () => {
    mocks.bookingFindFirst.mockResolvedValue(null);
    const r = await processOperatorTicketEmail(payload);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/^Needs review: Code BK-2026-10-ABC234/);
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.bookingFindMany).not.toHaveBeenCalled();
  });

  it('marks the return leg of a round trip', async () => {
    mocks.bookingFindFirst.mockResolvedValue(
      booking({
        tripType: 'ROUND_TRIP',
        leg: null,
        outboundLeg: { departureDate: new Date('2027-07-18T23:00:00Z') },
        returnLeg: leg,
      }),
    );
    await processOperatorTicketEmail(payload);
    expect(mocks.auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ newState: expect.objectContaining({ leg: 'return' }) }) }),
    );
  });
});

describe('name-only fallback (no booking code in the email)', () => {
  const noCode = email({ text: 'Hi Sita Friend,\nSanur → Nusa Penida · 22 Jul 2027 07:00' });

  beforeEach(() => mocks.load.mockResolvedValue(noCode));

  it('forwards when exactly one paid booking matches a passenger name at that departure', async () => {
    mocks.bookingFindMany.mockResolvedValue([booking()]);
    const r = await processOperatorTicketEmail(payload);
    expect(r).toEqual({ ok: true, status: 'forwarded' });
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ to: 'andy@example.com' }));
    expect(mocks.auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ newState: expect.objectContaining({ matchedBy: 'name' }) }) }),
    );
  });

  it('sends nothing when two bookings match', async () => {
    mocks.bookingFindMany.mockResolvedValue([booking(), booking({ id: 'bk-2', bookingReference: 'BK-2026-10-ZZZ234' })]);
    const r = await processOperatorTicketEmail(payload);
    expect(!r.ok && r.error).toMatch(/2 bookings match/);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('sends nothing when no booking matches the name', async () => {
    mocks.bookingFindMany.mockResolvedValue([booking({ customerName: 'Someone Else', notes: null })]);
    const r = await processOperatorTicketEmail(payload);
    expect(!r.ok && r.error).toMatch(/no paid booking matches/);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('needs a departure time as well as a name', async () => {
    mocks.load.mockResolvedValue(email({ text: 'Hi Sita Friend,' }));
    const r = await processOperatorTicketEmail(payload);
    expect(!r.ok && r.error).toMatch(/no departure time/);
    expect(mocks.bookingFindMany).not.toHaveBeenCalled();
  });
});

describe('safety', () => {
  it('never forwards the same Message-ID twice', async () => {
    mocks.auditFindFirst.mockResolvedValue({ id: 'a1', createdAt: new Date(), newState: { sent: true } });
    const r = await processOperatorTicketEmail(payload);
    expect(r).toEqual({ ok: true, status: 'already-forwarded' });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('marks the claim sent once the mail has gone out', async () => {
    await processOperatorTicketEmail(payload);
    expect(mocks.auditUpdate).toHaveBeenCalledWith({
      where: { id: 'claim-1' },
      data: { newState: expect.objectContaining({ messageId: '<m1@wahana>', sent: true }) },
    });
  });

  it('does not send while a recent unsent claim exists (another run is on it)', async () => {
    mocks.auditFindFirst.mockResolvedValue({ id: 'a1', createdAt: new Date(Date.now() - 60_000), newState: { messageId: '<m1@wahana>' } });
    const r = await processOperatorTicketEmail(payload);
    expect(!r.ok && r.error).toBe('Another run is forwarding this message');
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.auditDelete).not.toHaveBeenCalled();
  });

  it('a claim that was never marked sent and is old (the run died) is dropped and the mail is sent', async () => {
    mocks.auditFindFirst.mockResolvedValue({ id: 'a1', createdAt: new Date(Date.now() - 30 * 60_000), newState: { messageId: '<m1@wahana>' } });
    const r = await processOperatorTicketEmail(payload);
    expect(r).toEqual({ ok: true, status: 'forwarded' });
    expect(mocks.auditDelete).toHaveBeenCalledWith({ where: { id: 'a1' } });
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });

  it('forwards the operator email as plain text: its HTML is never passed on', async () => {
    mocks.load.mockResolvedValue(email({ html: '<p onclick=x()>Hi <a href="https://evil.test">pay</a></p>', text: 'Hi Andy Buyer BK-2026-10-ABC234,' }));
    await processOperatorTicketEmail(payload);
    const body = mocks.send.mock.calls[0][0].bodyHtml as string;
    expect(body).not.toMatch(/evil\.test|onclick/);
    expect(body).toContain('Hi Andy Buyer BK-2026-10-ABC234');
  });

  it('fails (retryable) when the mail server cannot send, and releases the claim', async () => {
    mocks.send.mockResolvedValue({ delivered: false, provider: 'smtp' });
    const r = await processOperatorTicketEmail(payload);
    expect(r.ok).toBe(false);
    expect(mocks.auditDelete).toHaveBeenCalledWith({ where: { id: 'claim-1' } });
  });

  it('shows why the mail server refused (not just that it did)', async () => {
    mocks.send.mockResolvedValue({ delivered: false, provider: 'smtp', error: 'Invalid login: 535 Username and Password not accepted' });
    const r = await processOperatorTicketEmail(payload);
    expect(!r.ok && r.error).toBe('The mail server could not send the forward: Invalid login: 535 Username and Password not accepted');
  });

  it('releases the claim and rethrows when the send itself throws, so a retry can send again', async () => {
    mocks.send.mockRejectedValue(new Error('ETIMEDOUT'));
    await expect(processOperatorTicketEmail(payload)).rejects.toThrow('ETIMEDOUT');
    expect(mocks.auditDelete).toHaveBeenCalledWith({ where: { id: 'claim-1' } });
  });

  it('a retry after a failed send is not reported as already forwarded', async () => {
    mocks.send.mockRejectedValueOnce(new Error('ETIMEDOUT'));
    await expect(processOperatorTicketEmail(payload)).rejects.toThrow();
    // The claim was deleted, so the duplicate check finds nothing on the retry.
    mocks.auditFindFirst.mockResolvedValue(null);
    expect(await processOperatorTicketEmail(payload)).toEqual({ ok: true, status: 'forwarded' });
  });

  it('claims the audit row before it sends', async () => {
    const order: string[] = [];
    mocks.auditCreate.mockImplementation(async () => (order.push('claim'), { id: 'c' }));
    mocks.send.mockImplementation(async () => (order.push('send'), { delivered: true, provider: 'smtp' }));
    await processOperatorTicketEmail(payload);
    expect(order).toEqual(['claim', 'send']);
  });

  it('treats mock mode (no SMTP configured) as forwarded and flags it in the audit row', async () => {
    mocks.configured.mockReturnValue(false);
    mocks.send.mockResolvedValue({ delivered: false, provider: 'console' });
    expect((await processOperatorTicketEmail(payload)).ok).toBe(true);
    expect(mocks.auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ newState: expect.objectContaining({ mock: true }) }) }),
    );
  });
});

describe('dry run', () => {
  it('reports the match and writes and sends nothing', async () => {
    const r = await processOperatorTicketEmail(payload, { dryRun: true });
    expect(r).toEqual({
      ok: true,
      status: 'dry-run: would forward to booking BK-2026-10-ABC234 (matched by code)',
    });
    expect(mocks.auditCreate).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('uses an email the caller already loaded instead of reading the mailbox again', async () => {
    await processOperatorTicketEmail(payload, { dryRun: true, email: email() });
    expect(mocks.load).not.toHaveBeenCalled();
  });
});

describe('admin pick', () => {
  it('forwards to the chosen booking and records the admin', async () => {
    mocks.load.mockResolvedValue(email({ text: 'Hi nobody,' }));
    const r = await processOperatorTicketEmail(payload, {
      forceBookingReference: 'BK-2026-10-ABC234',
      adminUserId: 'adm-1',
    });
    expect(r.ok).toBe(true);
    expect(mocks.auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({
        userId: 'adm-1',
        userRole: 'ADMIN',
        newState: expect.objectContaining({ matchedBy: 'admin' }),
      }) }),
    );
  });

  it('may pick a booking for mail the receiving server could not verify (a human decision)', async () => {
    mocks.load.mockResolvedValue(email({ authenticated: false, text: 'Hi nobody,' }));
    const r = await processOperatorTicketEmail(payload, { forceBookingReference: 'BK-2026-10-ABC234', adminUserId: 'adm-1' });
    expect(r.ok).toBe(true);
  });

  it('still refuses a pick when the email has no PDF', async () => {
    mocks.load.mockResolvedValue(email({ attachments: [] }));
    const r = await processOperatorTicketEmail(payload, { forceBookingReference: 'BK-2026-10-ABC234' });
    expect(!r.ok && r.error).toMatch(/No PDF/);
  });

  it('refuses a booking that is not paid or does not exist', async () => {
    mocks.bookingFindFirst.mockResolvedValue(null);
    const r = await processOperatorTicketEmail(payload, { forceBookingReference: 'BK-2026-10-NOPE22' });
    expect(!r.ok && r.error).toMatch(/not a paid booking/);
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
