import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

vi.mock('@/shared/server/db', () => ({
  prisma: {
    leg: { findFirst: vi.fn() },
    booking: { findMany: vi.fn() },
  },
}));
vi.mock('@/shared/server/auth', () => ({
  requireOperator: vi.fn(),
  getOperatorSession: vi.fn(),
}));

vi.mock('@/features/tickets/qr', () => ({
  buildQrPayload: (code: string) => `qr:${code}`,
}));

import { prisma } from '@/shared/server/db';
import { requireOperator, getOperatorSession } from '@/shared/server/auth';
import { GET as manifestJson } from '@/app/api/operator/manifest/[legId]/route';
import { GET as manifestCsv } from '@/app/api/operator/manifest/[legId]/csv/route';

const OUTBOUND = 'leg-out';
const RETURN = 'leg-ret';

const ticket = (
  code: string,
  name: string,
  checkins: { legId: string; checkedInAt: Date }[] = [],
) => ({
  ticketCode: code,
  passengerName: name,
  passengerIdNumber: null,
  status: 'ISSUED',
  checkedInAt: null,
  checkins,
});

const oneWay = {
  id: 'b-1',
  bookingReference: 'GF-ONEWAY',
  tripType: 'ONE_WAY',
  legId: OUTBOUND,
  outboundLegId: null,
  returnLegId: null,
  tickets: [ticket('TK-1', 'Budi')],
};
const roundTrip = {
  id: 'b-2',
  bookingReference: 'GF-ROUND',
  tripType: 'ROUND_TRIP',
  legId: null,
  outboundLegId: OUTBOUND,
  returnLegId: RETURN,
  tickets: [
    ticket('TK-2', 'Ani', [{ legId: OUTBOUND, checkedInAt: new Date('2026-10-20T01:00:00Z') }]),
    ticket('TK-3', 'Citra'),
  ],
};

const params = (legId: string) => ({ params: Promise.resolve({ legId }) });
const req = {} as NextRequest;

function bookingsForLeg(legId: string) {
  return [oneWay, roundTrip].filter(
    (b) => b.legId === legId || b.outboundLegId === legId || b.returnLegId === legId,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireOperator).mockResolvedValue({ sub: 'op-1' } as never);
  vi.mocked(getOperatorSession).mockResolvedValue({ sub: 'op-1' } as never);
  vi.mocked(prisma.leg.findFirst).mockImplementation((async (args: { where: { id: string } }) => ({
    id: args.where.id,
    operatorId: 'op-1',
    departureDate: new Date('2026-10-20T00:00:00Z'),
    schedule: { originPort: 'Padang Bai', destinationPort: 'Gili Trawangan', boat: { name: 'Boat' } },
  })) as never);
  vi.mocked(prisma.booking.findMany).mockImplementation((async (args: {
    where: { OR: Array<Record<string, string>> };
  }) => {
    const legId = Object.values(args.where.OR[0])[0];
    return bookingsForLeg(legId);
  }) as never);
});

describe('operator manifest JSON', () => {
  it('lists one-way and round-trip passengers on the outbound leg', async () => {
    const res = await manifestJson(req, params(OUTBOUND));
    const body = await res.json();

    expect(body.tickets.map((t: { passengerName: string }) => t.passengerName)).toEqual([
      'Budi',
      'Ani',
      'Citra',
    ]);
    expect(body.tickets.map((t: { trip: string }) => t.trip)).toEqual([
      'ONE_WAY',
      'OUTBOUND',
      'OUTBOUND',
    ]);
  });

  it('lists the round-trip passengers on the return leg too', async () => {
    const res = await manifestJson(req, params(RETURN));
    const body = await res.json();

    expect(body.tickets.map((t: { passengerName: string }) => t.passengerName)).toEqual([
      'Ani',
      'Citra',
    ]);
    expect(body.tickets.every((t: { trip: string }) => t.trip === 'RETURN')).toBe(true);
  });

  it('scopes the booking lookup to the operator and confirmed bookings', async () => {
    await manifestJson(req, params(OUTBOUND));

    const where = vi.mocked(prisma.booking.findMany).mock.calls[0][0]!.where as Record<string, unknown>;
    expect(where).toMatchObject({ operatorId: 'op-1', status: 'CONFIRMED' });
    expect(where.OR).toEqual([
      { legId: OUTBOUND },
      { outboundLegId: OUTBOUND },
      { returnLegId: OUTBOUND },
    ]);
  });
});

describe('operator manifest check-in status per leg', () => {
  it('shows a passenger who boarded outbound as CHECKED_IN there and ISSUED on return', async () => {
    const outbound = await (await manifestJson(req, params(OUTBOUND))).json();
    const ret = await (await manifestJson(req, params(RETURN))).json();

    const status = (body: { tickets: { ticketCode: string; status: string }[] }, code: string) =>
      body.tickets.find((t) => t.ticketCode === code)?.status;
    expect(status(outbound, 'TK-2')).toBe('CHECKED_IN');
    expect(status(ret, 'TK-2')).toBe('ISSUED');
    expect(status(outbound, 'TK-3')).toBe('ISSUED');
  });
});

describe('operator manifest CSV', () => {
  it('includes round-trip passengers with a Trip column on both legs', async () => {
    const outbound = await (await manifestCsv(req, params(OUTBOUND))).text();
    const ret = await (await manifestCsv(req, params(RETURN))).text();

    expect(outbound.split('\r\n')[0]).toBe(
      'Ticket Code,Passenger Name,ID Number,Status,Booking Reference,Trip',
    );
    expect(outbound).toContain('TK-1,Budi,,ISSUED,GF-ONEWAY,One-way');
    expect(outbound).toContain('TK-2,Ani,,CHECKED_IN,GF-ROUND,Round trip · outbound');
    expect(ret).toContain('TK-3,Citra,,ISSUED,GF-ROUND,Round trip · return');
    expect(ret).not.toContain('GF-ONEWAY');
  });
});
