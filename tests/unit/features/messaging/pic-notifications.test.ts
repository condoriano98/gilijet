import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  picFind: vi.fn(),
  bookingFind: vi.fn(),
  sendTemplate: vi.fn(),
  audit: vi.fn(),
  env: { PIC_ORDER_TEMPLATE: 'pic_order_paid' as string | undefined },
}));

vi.mock('@/shared/server/db', () => ({
  prisma: {
    operatorPicContact: { findMany: mocks.picFind },
    booking: { findUnique: mocks.bookingFind },
  },
}));
vi.mock('@/shared/server/env', () => ({ env: mocks.env }));
vi.mock('@/shared/server/audit', () => ({ audit: mocks.audit }));
vi.mock('@/features/messaging/whatsapp', async () => {
  const actual = await vi.importActual<typeof import('@/features/messaging/whatsapp')>(
    '@/features/messaging/whatsapp',
  );
  return { ...actual, sendTemplateMessage: mocks.sendTemplate };
});

import {
  formatPicOrderParams,
  notifyOperatorPicsOrderPaid,
  parsePicPassengers,
  picRecipients,
} from '@/features/messaging/pic-notifications';

const leg = (origin: string, dest: string, iso: string) => ({
  departureDate: new Date(iso),
  schedule: { originPort: origin, destinationPort: dest },
});

const NOTES = JSON.stringify({
  passengers: [
    { name: 'Anita', type: 'ADULT' },
    { name: 'Suli', type: 'CHILD' },
    { name: 'Baby', type: 'INFANT' },
    { name: 'NoType' },
  ],
});

const ONE_WAY = {
  operatorId: 'op-1',
  bookingReference: 'BK-2026-09-ABC234',
  customerNationality: 'Argentina',
  notes: NOTES,
  tripType: 'ONE_WAY' as const,
  operator: { companyName: 'PT WAHANA VIRENDRA GROUP' },
  leg: leg('Sanur', 'Nusa Penida', '2026-09-03T23:00:00Z'),
};

beforeEach(() => {
  mocks.picFind.mockReset().mockResolvedValue([{ nohpNotifikasi: '0812 3456 7890' }]);
  mocks.bookingFind.mockReset().mockResolvedValue(ONE_WAY);
  mocks.sendTemplate.mockReset().mockResolvedValue({ delivered: true, provider: 'wati' });
  mocks.audit.mockReset().mockResolvedValue(undefined);
  mocks.env.PIC_ORDER_TEMPLATE = 'pic_order_paid';
});

describe('parsePicPassengers', () => {
  it('maps type to a label and defaults to Adult', () => {
    expect(parsePicPassengers(NOTES).map((p) => p.category)).toEqual([
      'Adult',
      'Child',
      'Infant',
      'Adult',
    ]);
  });

  it('returns [] for empty or broken notes', () => {
    expect(parsePicPassengers(null)).toEqual([]);
    expect(parsePicPassengers('not json')).toEqual([]);
  });
});

describe('formatPicOrderParams', () => {
  it('describes a one-way booking in WITA, one nationality for everyone', () => {
    const p = formatPicOrderParams(ONE_WAY)!;
    expect(p.booking_code).toBe('BK-2026-09-ABC234');
    expect(p.passenger_count).toBe('4');
    expect(p.passengers).toBe(
      'Anita (Adult, Argentina); Suli (Child, Argentina); Baby (Infant, Argentina); NoType (Adult, Argentina)',
    );
    expect(p.passengers).not.toContain('\n');
    expect(p.boat).toBe('PT WAHANA VIRENDRA GROUP');
    expect(p.trip_type).toBe('One way');
    expect(p.route).toBe('Sanur to Nusa Penida');
    // 23:00Z is 07:00 WITA the next day
    expect(p.departure).toContain('07:00');
    expect(p.departure).toContain('04 Sep 2026');
    expect(p.departure.endsWith('WITA')).toBe(true);
    expect(p.return_trip).toBe('-');
  });

  it('includes the return leg for a round trip', () => {
    const p = formatPicOrderParams({
      ...ONE_WAY,
      tripType: 'ROUND_TRIP',
      leg: null,
      outboundLeg: leg('Sanur', 'Nusa Penida', '2026-09-03T23:00:00Z'),
      returnLeg: leg('Nusa Penida', 'Sanur', '2026-09-06T04:00:00Z'),
    })!;
    expect(p.trip_type).toBe('Round trip');
    expect(p.route).toBe('Sanur to Nusa Penida');
    expect(p.return_trip).toContain('Nusa Penida to Sanur');
    expect(p.return_trip).toContain('12:00');
  });

  it('shows a dash for a missing nationality and returns null without a leg', () => {
    expect(formatPicOrderParams({ ...ONE_WAY, customerNationality: null })!.passengers).toContain(
      'Anita (Adult, -)',
    );
    expect(formatPicOrderParams({ ...ONE_WAY, leg: null })).toBeNull();
  });

  it('never leaves a param empty when the booking has no passenger list', () => {
    const p = formatPicOrderParams({ ...ONE_WAY, notes: null })!;
    expect(p.passenger_count).toBe('0');
    expect(p.passengers).toBe('-');
    expect(Object.values(p).every((v) => v.length > 0)).toBe(true);
  });
});

describe('picRecipients', () => {
  it('queries the operator rows plus platform rows, active only', async () => {
    await picRecipients('op-1');
    expect(mocks.picFind).toHaveBeenCalledWith({
      where: {
        deletedAt: null,
        nohpNotifikasi: { not: null },
        OR: [{ operatorId: 'op-1' }, { operatorId: null }],
      },
      select: { nohpNotifikasi: true },
    });
  });

  it('normalises and de-duplicates numbers, dropping unusable ones', async () => {
    mocks.picFind.mockResolvedValue([
      { nohpNotifikasi: '0812 3456 7890' },
      { nohpNotifikasi: '+62 812-3456-7890' },
      { nohpNotifikasi: '123' },
      { nohpNotifikasi: '6281999000111' },
    ]);
    expect(await picRecipients('op-1')).toEqual(['6281234567890', '6281999000111']);
  });
});

describe('notifyOperatorPicsOrderPaid', () => {
  it('sends the template to every recipient and audits the count', async () => {
    mocks.picFind.mockResolvedValue([
      { nohpNotifikasi: '081234567890' },
      { nohpNotifikasi: '081999000111' },
    ]);
    await notifyOperatorPicsOrderPaid('bk-1');

    expect(mocks.sendTemplate).toHaveBeenCalledTimes(2);
    const arg = mocks.sendTemplate.mock.calls[0][0];
    expect(arg.templateName).toBe('pic_order_paid');
    expect(arg.params.booking_code).toBe('BK-2026-09-ABC234');
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'BOOKING',
        entityId: 'bk-1',
        action: 'pic_order_notified',
        newState: { recipients: 2, delivered: 2 },
      }),
    );
  });

  it('is skipped when PIC_ORDER_TEMPLATE is unset', async () => {
    mocks.env.PIC_ORDER_TEMPLATE = undefined;
    await notifyOperatorPicsOrderPaid('bk-1');
    expect(mocks.bookingFind).not.toHaveBeenCalled();
    expect(mocks.sendTemplate).not.toHaveBeenCalled();
  });

  it('does nothing for an unknown booking', async () => {
    mocks.bookingFind.mockResolvedValue(null);
    await notifyOperatorPicsOrderPaid('nope');
    expect(mocks.sendTemplate).not.toHaveBeenCalled();
  });

  it('never throws, and one failed send does not stop the others', async () => {
    mocks.picFind.mockResolvedValue([
      { nohpNotifikasi: '081234567890' },
      { nohpNotifikasi: '081999000111' },
    ]);
    mocks.sendTemplate
      .mockRejectedValueOnce(new Error('WATI down'))
      .mockResolvedValueOnce({ delivered: true, provider: 'wati' });
    await expect(notifyOperatorPicsOrderPaid('bk-1')).resolves.toBeUndefined();
    expect(mocks.sendTemplate).toHaveBeenCalledTimes(2);
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({ newState: { recipients: 2, delivered: 1 } }),
    );

    mocks.bookingFind.mockRejectedValue(new Error('db down'));
    await expect(notifyOperatorPicsOrderPaid('bk-1')).resolves.toBeUndefined();
  });
});
