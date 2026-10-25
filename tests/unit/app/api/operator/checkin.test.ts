import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

type State = {
  ticket: Record<string, unknown> & { status: string; checkedInAt: Date | null; checkins: { legId: string; checkedInAt: Date }[] };
};
const state = vi.hoisted(() => ({ ticket: null as unknown as State['ticket'] }));

vi.mock('@/shared/server/db', () => {
  const tx = {
    ticket: {
      findUnique: vi.fn(async () => state.ticket),
      updateMany: vi.fn(async ({ where, data }: { where: { status: string }; data: Record<string, unknown> }) => {
        if (state.ticket.status !== where.status) return { count: 0 };
        Object.assign(state.ticket, data);
        return { count: 1 };
      }),
    },
    ticketCheckin: {
      createMany: vi.fn(async ({ data }: { data: { legId: string }[] }) => {
        const [row] = data;
        if (state.ticket.checkins.some((c) => c.legId === row.legId)) return { count: 0 };
        state.ticket.checkins.push({ legId: row.legId, checkedInAt: new Date() });
        return { count: 1 };
      }),
    },
    auditLog: { create: vi.fn(async () => ({})) },
  };
  return { prisma: { $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx) } };
});
vi.mock('@/shared/server/auth', () => ({ getOperatorSession: vi.fn(async () => ({ sub: 'op-1' })) }));
vi.mock('@/features/tickets/qr', () => ({
  verifyQrPayload: (p: string) => {
    const [ticketCode, departureYmd] = p.split('|');
    return { ok: true, ticketCode, departureYmd };
  },
}));

import { POST } from '@/app/api/operator/checkin/route';

const legOut = {
  id: 'leg-out',
  operatorId: 'op-1',
  status: 'OPEN',
  departureDate: new Date('2026-10-20T00:00:00Z'),
  schedule: { originPort: 'Padang Bai', destinationPort: 'Gili Trawangan' },
};
const legRet = {
  id: 'leg-ret',
  operatorId: 'op-1',
  status: 'OPEN',
  departureDate: new Date('2026-10-22T00:00:00Z'),
  schedule: { originPort: 'Gili Trawangan', destinationPort: 'Padang Bai' },
};

function scan(legId: string, ymd: string) {
  const req = new Request('http://localhost/api/operator/checkin', {
    method: 'POST',
    body: JSON.stringify({ qrPayload: `TK-1|${ymd}`, legId }),
  }) as unknown as NextRequest;
  return POST(req).then(async (r) => ({ status: r.status, body: await r.json() }));
}

type Fixture = State['ticket'] & { booking: Record<string, unknown> };

function roundTripTicket(): Fixture {
  return {
    id: 't-1',
    ticketCode: 'TK-1',
    passengerName: 'Budi',
    status: 'ISSUED',
    checkedInAt: null,
    checkins: [],
    booking: {
      bookingReference: 'GF-ROUND',
      tripType: 'ROUND_TRIP',
      legId: null,
      outboundLegId: 'leg-out',
      returnLegId: 'leg-ret',
      leg: null,
      outboundLeg: legOut,
      returnLeg: legRet,
    },
  };
}

beforeEach(() => {
  state.ticket = roundTripTicket();
});

describe('operator check-in: round trip', () => {
  it('lets a passenger board outbound and then return', async () => {
    expect((await scan('leg-out', '2026-10-20')).body.ok).toBe(true);
    expect((await scan('leg-ret', '2026-10-22')).body.ok).toBe(true);
    expect(state.ticket.status).toBe('CHECKED_IN');
  });

  it('keeps the ticket ISSUED after only the outbound scan', async () => {
    await scan('leg-out', '2026-10-20');
    expect(state.ticket.status).toBe('ISSUED');
  });

  it('rejects a second scan on the same leg', async () => {
    await scan('leg-out', '2026-10-20');
    const again = await scan('leg-out', '2026-10-20');
    expect(again.status).toBe(409);
    expect(again.body.reason).toBe('ALREADY_CHECKED_IN');

    await scan('leg-ret', '2026-10-22');
    const againRet = await scan('leg-ret', '2026-10-22');
    expect(againRet.body.reason).toBe('ALREADY_CHECKED_IN');
  });

  it('rejects the outbound QR on the return leg and vice versa', async () => {
    const outboundQrOnReturn = await scan('leg-ret', '2026-10-20');
    expect(outboundQrOnReturn.body.reason).toBe('INVALID_QR');
    const returnQrOnOutbound = await scan('leg-out', '2026-10-22');
    expect(returnQrOnOutbound.body.reason).toBe('INVALID_QR');
    expect(state.ticket.checkins).toHaveLength(0);
  });

  it('boards the return leg of a legacy ticket already flagged CHECKED_IN', async () => {
    state.ticket.status = 'CHECKED_IN';
    state.ticket.checkedInAt = new Date('2026-10-20T01:00:00Z');

    expect((await scan('leg-out', '2026-10-20')).body.reason).toBe('ALREADY_CHECKED_IN');
    expect((await scan('leg-ret', '2026-10-22')).body.ok).toBe(true);
  });

  it('still refuses refunded tickets on either leg', async () => {
    state.ticket.status = 'REFUNDED';
    expect((await scan('leg-out', '2026-10-20')).body.reason).toBe('REFUNDED');
    expect((await scan('leg-ret', '2026-10-22')).body.reason).toBe('REFUNDED');
  });
});

describe('operator check-in: one-way is unchanged', () => {
  beforeEach(() => {
    const t = roundTripTicket();
    t.booking = {
      ...t.booking,
      tripType: 'ONE_WAY',
      legId: 'leg-out',
      outboundLegId: null,
      returnLegId: null,
      leg: legOut,
      outboundLeg: null,
      returnLeg: null,
    };
    state.ticket = t;
  });

  it('flips to CHECKED_IN on the first scan and rejects the second', async () => {
    expect((await scan('leg-out', '2026-10-20')).body.ok).toBe(true);
    expect(state.ticket.status).toBe('CHECKED_IN');
    expect((await scan('leg-out', '2026-10-20')).body.reason).toBe('ALREADY_CHECKED_IN');
  });
});
