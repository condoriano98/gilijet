import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';

const mocks = vi.hoisted(() => ({ enabled: true }));

vi.mock('@/features/marketing/config', () => ({
  eventsEnabled: () => mocks.enabled,
  marketingEnvironment: () => 'test',
}));

import { recordBookingEvent, recordMarketingEvent } from '@/features/marketing/events';
import { bookingEventId, dedupeKeyFor, EVENT_DICTIONARY } from '@/features/marketing/contract';
import { toPlatformValue, fromMicros } from '@/features/marketing/money';

function makeTx(opts: { eventCount?: number; failCreate?: boolean } = {}) {
  const raw: string[] = [];
  return {
    raw,
    tx: {
      $executeRawUnsafe: vi.fn(async (sql: string) => {
        raw.push(sql);
        return 0;
      }),
      marketingEvent: {
        createMany: vi.fn(async () => {
          if (opts.failCreate) throw new Error('relation "MarketingEvent" does not exist');
          return { count: opts.eventCount ?? 1 };
        }),
      },
      marketingEventDelivery: { createMany: vi.fn(async () => ({ count: 3 })) },
      booking: {
        findUnique: vi.fn(async () => ({
          id: 'bk1',
          operatorId: 'op1',
          tripType: 'ROUND_TRIP',
          totalAmount: new Prisma.Decimal('900000'),
          currency: 'IDR',
          notes: JSON.stringify({ passengers: [{ name: 'A' }, { name: 'B' }, { name: 'C', type: 'INFANT' }] }),
          legId: null,
          outboundLegId: 'leg-out',
          leg: null,
          outboundLeg: { departureDate: new Date('2026-11-01T01:00:00Z'), schedule: { originPort: 'PDB', destinationPort: 'GTA' } },
        })),
      },
      bookingAttribution: {
        findUnique: vi.fn(async () => ({ consentAnalytics: true, consentMarketing: false, visitorId: 'v1' })),
      },
    },
  };
}

beforeEach(() => {
  mocks.enabled = true;
});

describe('contract', () => {
  it('only purchase is a Google Ads conversion and Meta Purchase', () => {
    const conversions = Object.entries(EVENT_DICTIONARY).filter(([, d]) => d.googleAds === 'purchase');
    expect(conversions.map(([k]) => k)).toEqual(['purchase']);
    expect(EVENT_DICTIONARY.purchase.meta).toBe('Purchase');
    expect(EVENT_DICTIONARY.begin_checkout.meta).toBeNull();
  });

  it('builds stable ids and once-per-booking dedupe keys', () => {
    expect(bookingEventId('purchase', 'bk1')).toBe('purchase_bk1');
    expect(dedupeKeyFor('purchase', 'bk1')).toBe('purchase:bk1');
    expect(dedupeKeyFor('begin_checkout', 'bk1')).toBeNull();
    expect(dedupeKeyFor('refund', 'bk1', 'rf1')).toBe('refund:rf1');
  });
});

describe('money', () => {
  it('converts Decimal and micros', () => {
    expect(toPlatformValue(new Prisma.Decimal('1250000.00'))).toBe(1250000);
    expect(toPlatformValue(null)).toBeNull();
    expect(fromMicros('1234567890')?.toString()).toBe('1234.57');
  });
});

describe('recordMarketingEvent', () => {
  it('writes the event and a delivery per server destination inside a savepoint', async () => {
    const { tx, raw } = makeTx();
    const id = await recordMarketingEvent(tx as never, {
      eventName: 'purchase',
      bookingId: 'bk1',
      consent: { analytics: true, marketing: true, decided: true },
    });
    expect(id).toBe('purchase_bk1');
    const row = (tx.marketingEvent.createMany.mock.calls[0] as unknown as [{ data: Array<Record<string, unknown>>; skipDuplicates: boolean }])[0];
    expect(row.skipDuplicates).toBe(true);
    expect(row.data[0]).toMatchObject({ eventId: 'purchase_bk1', dedupeKey: 'purchase:bk1', environment: 'test' });
    const deliveries = (tx.marketingEventDelivery.createMany.mock.calls[0] as unknown as [{ data: Array<{ destination: string }> }])[0];
    expect(deliveries.data.map((d) => d.destination)).toEqual(['GA4', 'GOOGLE_ADS', 'META_CAPI']);
    expect(raw).toEqual(['SAVEPOINT marketing_event', 'RELEASE SAVEPOINT marketing_event']);
  });

  it('is a no-op for a duplicate (redelivered webhook)', async () => {
    const { tx } = makeTx({ eventCount: 0 });
    const id = await recordMarketingEvent(tx as never, {
      eventName: 'purchase',
      bookingId: 'bk1',
      consent: { analytics: true, marketing: true, decided: true },
    });
    expect(id).toBeNull();
    expect(tx.marketingEventDelivery.createMany).not.toHaveBeenCalled();
  });

  it('rolls back to the savepoint instead of throwing when the write fails', async () => {
    const { tx, raw } = makeTx({ failCreate: true });
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(
      recordMarketingEvent(tx as never, { eventName: 'purchase', bookingId: 'bk1', consent: { analytics: false, marketing: false, decided: false } }),
    ).resolves.toBeNull();
    expect(raw).toContain('ROLLBACK TO SAVEPOINT marketing_event');
    err.mockRestore();
  });

  it('does nothing when events are switched off', async () => {
    mocks.enabled = false;
    const { tx } = makeTx();
    expect(await recordMarketingEvent(tx as never, { eventName: 'purchase', bookingId: 'bk1', consent: { analytics: true, marketing: true, decided: true } })).toBeNull();
    expect(tx.$executeRawUnsafe).not.toHaveBeenCalled();
  });
});

describe('recordBookingEvent', () => {
  it('fills route, departure, passengers, value and consent from the booking', async () => {
    const { tx } = makeTx();
    await recordBookingEvent(tx as never, 'purchase', 'bk1');
    const row = (tx.marketingEvent.createMany.mock.calls[0] as unknown as [{ data: Array<Record<string, unknown>> }])[0].data[0];
    expect(row).toMatchObject({
      routeCode: 'PDB-GTA',
      legId: 'leg-out',
      passengerCount: 3,
      currency: 'IDR',
      visitorId: 'v1',
      consent: { analytics: true, marketing: false, decided: true },
      properties: { trip_type: 'ROUND_TRIP', legs: 2, passenger_legs: 6, infants: 1 },
    });
    expect(String(row.value)).toBe('900000');
  });
});
