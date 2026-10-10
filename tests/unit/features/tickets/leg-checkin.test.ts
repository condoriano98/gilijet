import { describe, it, expect, vi } from 'vitest';
import type { Prisma } from '@prisma/client';
import {
  boardedLegIds,
  checkedInAtOnLeg,
  ticketStatusOnLeg,
  recordLegCheckin,
} from '@/features/tickets/leg-checkin';

const roundTrip = { tripType: 'ROUND_TRIP', legId: null, outboundLegId: 'out', returnLegId: 'ret' } as const;
const oneWay = { tripType: 'ONE_WAY', legId: 'only', outboundLegId: null, returnLegId: null } as const;

const at = new Date('2026-10-20T01:00:00Z');
const ticket = (over: Partial<{ status: string; checkedInAt: Date | null; checkins: { legId: string; checkedInAt: Date }[] }> = {}) =>
  ({ id: 't-1', status: 'ISSUED', checkedInAt: null, checkins: [], ...over }) as never;

describe('boardedLegIds', () => {
  it('is empty for a fresh ticket', () => {
    expect(boardedLegIds(ticket(), roundTrip).size).toBe(0);
  });

  it('lists only the legs with a check-in row', () => {
    const t = ticket({ checkins: [{ legId: 'out', checkedInAt: at }] });
    expect([...boardedLegIds(t, roundTrip)]).toEqual(['out']);
  });

  it('treats a legacy CHECKED_IN one-way ticket (no rows) as boarded on its leg', () => {
    expect([...boardedLegIds(ticket({ status: 'CHECKED_IN', checkedInAt: at }), oneWay)]).toEqual(['only']);
  });

  it('treats a legacy CHECKED_IN round-trip ticket as boarded outbound only', () => {
    expect([...boardedLegIds(ticket({ status: 'CHECKED_IN', checkedInAt: at }), roundTrip)]).toEqual(['out']);
  });

  it('keeps the legacy outbound boarding once a return row exists', () => {
    const t = ticket({ status: 'CHECKED_IN', checkins: [{ legId: 'ret', checkedInAt: at }] });
    expect(boardedLegIds(t, roundTrip)).toEqual(new Set(['out', 'ret']));
  });
});

describe('ticketStatusOnLeg', () => {
  it('shows a half-boarded round trip as CHECKED_IN outbound and ISSUED on return', () => {
    const t = ticket({ checkins: [{ legId: 'out', checkedInAt: at }] });
    expect(ticketStatusOnLeg(t, roundTrip, 'out')).toBe('CHECKED_IN');
    expect(ticketStatusOnLeg(t, roundTrip, 'ret')).toBe('ISSUED');
  });

  it('never hides a refunded or no-show ticket', () => {
    expect(ticketStatusOnLeg(ticket({ status: 'REFUNDED' }), roundTrip, 'out')).toBe('REFUNDED');
    expect(ticketStatusOnLeg(ticket({ status: 'NO_SHOW' }), roundTrip, 'ret')).toBe('NO_SHOW');
  });
});

describe('checkedInAtOnLeg', () => {
  it('returns the time of that leg only', () => {
    const t = ticket({ checkins: [{ legId: 'out', checkedInAt: at }] });
    expect(checkedInAtOnLeg(t, roundTrip, 'out')).toEqual(at);
    expect(checkedInAtOnLeg(t, roundTrip, 'ret')).toBeNull();
  });

  it('falls back to the ticket timestamp for legacy first-leg check-ins', () => {
    expect(checkedInAtOnLeg(ticket({ status: 'CHECKED_IN', checkedInAt: at }), roundTrip, 'out')).toEqual(at);
  });
});

describe('recordLegCheckin', () => {
  const makeTx = (created: number) => {
    const createMany = vi.fn().mockResolvedValue({ count: created });
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    return {
      tx: { ticketCheckin: { createMany }, ticket: { updateMany } } as unknown as Prisma.TransactionClient,
      createMany,
      updateMany,
    };
  };

  it('fails without touching the ticket when the (ticket, leg) row already exists', async () => {
    const { tx, updateMany } = makeTx(0);
    const res = await recordLegCheckin(tx, { ticket: ticket(), booking: roundTrip, legId: 'out', by: 'op-1' });
    expect(res.ok).toBe(false);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('keeps a round-trip ticket ISSUED after the first leg', async () => {
    const { tx, createMany, updateMany } = makeTx(1);
    const res = await recordLegCheckin(tx, { ticket: ticket(), booking: roundTrip, legId: 'out', by: 'op-1' });
    expect(res.ok).toBe(true);
    expect(createMany).toHaveBeenCalledWith({
      data: [{ ticketId: 't-1', legId: 'out', checkedInBy: 'op-1' }],
      skipDuplicates: true,
    });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('flips a round-trip ticket to CHECKED_IN once both legs have boarded', async () => {
    const { tx, updateMany } = makeTx(1);
    const t = ticket({ checkins: [{ legId: 'out', checkedInAt: at }] });
    await recordLegCheckin(tx, { ticket: t, booking: roundTrip, legId: 'ret', by: 'op-1' });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 't-1', status: 'ISSUED' },
      data: expect.objectContaining({ status: 'CHECKED_IN', checkedInBy: 'op-1' }),
    });
  });

  it('flips a one-way ticket on its single check-in', async () => {
    const { tx, updateMany } = makeTx(1);
    await recordLegCheckin(tx, { ticket: ticket(), booking: oneWay, legId: 'only', by: 'op-1' });
    expect(updateMany).toHaveBeenCalledTimes(1);
  });
});
