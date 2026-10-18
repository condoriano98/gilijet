import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  picFind: vi.fn(),
  bookingFindFirst: vi.fn(),
  bookingFindMany: vi.fn(),
  auditFindFirst: vi.fn(),
  auditCreate: vi.fn(),
  auditDelete: vi.fn(),
  env: { RESEND_API_KEY: 're_test' } as Record<string, string | undefined>,
  load: vi.fn(),
  send: vi.fn(),
}));

vi.mock('@/shared/server/db', () => ({
  prisma: {
    operatorPicContact: { findMany: mocks.picFind },
    booking: { findFirst: mocks.bookingFindFirst, findMany: mocks.bookingFindMany },
    auditLog: { findFirst: mocks.auditFindFirst, create: mocks.auditCreate, delete: mocks.auditDelete },
  },
}));
vi.mock('@/shared/server/env', () => ({ env: mocks.env }));
vi.mock('@/features/messaging/resend-inbound', () => ({ loadReceivedEmail: mocks.load }));
vi.mock('@/features/messaging/email', () => ({ sendOperatorTicketForward: mocks.send }));

import { processOperatorTicketEmail } from '@/features/tickets/operator-ticket-email';
import { SENDER_NOT_ALLOWED } from '@/features/payments/webhook-events';

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
  mocks.env.RESEND_API_KEY = 're_test';
  mocks.send.mockResolvedValue({ delivered: true, provider: 'resend' });
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
    mocks.auditFindFirst.mockResolvedValue({ id: 'a1' });
    const r = await processOperatorTicketEmail(payload);
    expect(r).toEqual({ ok: true, status: 'already-forwarded' });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('fails (retryable) when Resend cannot send, and releases the claim', async () => {
    mocks.send.mockResolvedValue({ delivered: false, provider: 'resend' });
    const r = await processOperatorTicketEmail(payload);
    expect(r.ok).toBe(false);
    expect(mocks.auditDelete).toHaveBeenCalledWith({ where: { id: 'claim-1' } });
  });

  it('with a key but no from-address (nothing sent) is a failure, not a forward', async () => {
    mocks.send.mockResolvedValue({ delivered: false, provider: 'console' });
    expect((await processOperatorTicketEmail(payload)).ok).toBe(false);
  });

  it('claims the audit row before it sends', async () => {
    const order: string[] = [];
    mocks.auditCreate.mockImplementation(async () => (order.push('claim'), { id: 'c' }));
    mocks.send.mockImplementation(async () => (order.push('send'), { delivered: true, provider: 'resend' }));
    await processOperatorTicketEmail(payload);
    expect(order).toEqual(['claim', 'send']);
  });

  it('treats mock mode (no Resend key) as forwarded and flags it in the audit row', async () => {
    mocks.env.RESEND_API_KEY = undefined;
    mocks.send.mockResolvedValue({ delivered: false, provider: 'console' });
    expect((await processOperatorTicketEmail(payload)).ok).toBe(true);
    expect(mocks.auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ newState: expect.objectContaining({ mock: true }) }) }),
    );
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

  it('refuses a booking that is not paid or does not exist', async () => {
    mocks.bookingFindFirst.mockResolvedValue(null);
    const r = await processOperatorTicketEmail(payload, { forceBookingReference: 'BK-2026-10-NOPE22' });
    expect(!r.ok && r.error).toMatch(/not a paid booking/);
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
