import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import {
  EVENT_DICTIONARY,
  SCHEMA_VERSION,
  bookingEventId,
  dedupeKeyFor,
  refundEventId,
  type EventName,
} from '@/features/marketing/contract';
import { eventsEnabled, marketingEnvironment } from '@/features/marketing/config';
import type { ConsentSnapshot } from '@/features/marketing/consent';

type Db = Prisma.TransactionClient;

export type MarketingEventInput = {
  eventName: EventName;
  occurredAt?: Date;
  bookingId?: string | null;
  refundId?: string | null;
  eventId?: string;
  source?: 'SERVER' | 'BROWSER';
  operatorId?: string | null;
  routeCode?: string | null;
  legId?: string | null;
  departureDate?: Date | null;
  passengerCount?: number | null;
  currency?: string | null;
  value?: Prisma.Decimal | number | null;
  visitorId?: string | null;
  consent: ConsentSnapshot;
  properties?: Record<string, string | number | boolean | null>;
};

/**
 * Append one event to the ledger plus a PENDING delivery row per server
 * destination, inside the caller's transaction.
 *
 * Must never fail the money path it rides on. Two layers make sure of that:
 * - duplicates are inserted with ON CONFLICT DO NOTHING (createMany with
 *   skipDuplicates), so a redelivered webhook is a no-op instead of a unique
 *   violation that would abort the whole Postgres transaction;
 * - anything else runs inside a SAVEPOINT that is rolled back on error, so a
 *   missing table or a bad value leaves the booking transition intact.
 *
 * Returns the event id when a new row was written, null otherwise.
 */
export async function recordMarketingEvent(tx: Db, input: MarketingEventInput): Promise<string | null> {
  if (!eventsEnabled()) return null;

  const eventId =
    input.eventId ??
    (input.eventName === 'refund' && input.refundId
      ? refundEventId(input.refundId)
      : input.bookingId && EVENT_DICTIONARY[input.eventName].oncePerBooking
        ? bookingEventId(input.eventName, input.bookingId)
        : `${input.eventName}_${randomUUID()}`);

  await tx.$executeRawUnsafe('SAVEPOINT marketing_event');
  try {
    const id = randomUUID();
    const created = await tx.marketingEvent.createMany({
      skipDuplicates: true,
      data: [
        {
          id,
          eventId,
          eventName: input.eventName,
          schemaVersion: SCHEMA_VERSION,
          source: input.source ?? 'SERVER',
          occurredAt: input.occurredAt ?? new Date(),
          environment: marketingEnvironment(),
          bookingId: input.bookingId ?? null,
          refundId: input.refundId ?? null,
          dedupeKey: dedupeKeyFor(input.eventName, input.bookingId ?? null, input.refundId),
          operatorId: input.operatorId ?? null,
          routeCode: input.routeCode ?? null,
          legId: input.legId ?? null,
          departureDate: input.departureDate ?? null,
          passengerCount: input.passengerCount ?? null,
          currency: input.currency ?? null,
          value: input.value == null ? null : new Prisma.Decimal(input.value),
          visitorId: input.visitorId ?? null,
          consent: input.consent,
          properties: input.properties ?? Prisma.JsonNull,
        },
      ],
    });
    if (created.count === 0) {
      await tx.$executeRawUnsafe('RELEASE SAVEPOINT marketing_event');
      return null;
    }
    const destinations = EVENT_DICTIONARY[input.eventName].server;
    if (destinations.length > 0) {
      await tx.marketingEventDelivery.createMany({
        skipDuplicates: true,
        data: destinations.map((destination) => ({ marketingEventId: id, destination })),
      });
    }
    await tx.$executeRawUnsafe('RELEASE SAVEPOINT marketing_event');
    return eventId;
  } catch (err) {
    await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT marketing_event').catch(() => undefined);
    console.error(`[marketing] could not record ${input.eventName}:`, err instanceof Error ? err.message : err);
    return null;
  }
}

/** Passenger list embedded in Booking.notes by the booking engine. */
export function passengersFromNotes(notes: string | null): Array<{ type?: string }> {
  if (!notes) return [];
  try {
    const parsed = JSON.parse(notes) as { passengers?: Array<{ type?: string }> };
    return Array.isArray(parsed.passengers) ? parsed.passengers : [];
  } catch {
    return [];
  }
}

const bookingForEvent = {
  id: true,
  operatorId: true,
  tripType: true,
  totalAmount: true,
  currency: true,
  notes: true,
  legId: true,
  outboundLegId: true,
  leg: { select: { departureDate: true, schedule: { select: { originPort: true, destinationPort: true } } } },
  outboundLeg: { select: { departureDate: true, schedule: { select: { originPort: true, destinationPort: true } } } },
} satisfies Prisma.BookingSelect;

/**
 * Record a booking milestone, filling route, departure, passengers, value and
 * consent from the booking and its frozen attribution snapshot.
 *
 * Passenger convention: `passengerCount` is people on the booking (infants
 * included), counted once whether the booking is one-way or round trip.
 * `passenger_legs` in properties is people × legs, the unit the per-journey
 * margin is quoted in.
 */
export async function recordBookingEvent(
  tx: Db,
  eventName: EventName,
  bookingId: string,
  extra: {
    eventId?: string;
    occurredAt?: Date;
    value?: Prisma.Decimal | number | null;
    refundId?: string | null;
    properties?: Record<string, string | number | boolean | null>;
  } = {},
): Promise<string | null> {
  if (!eventsEnabled()) return null;
  // The lookups get their own savepoint: in Postgres a failed read aborts the
  // enclosing transaction just as a failed write does.
  await tx.$executeRawUnsafe('SAVEPOINT marketing_lookup');
  let booking;
  let attribution;
  try {
    [booking, attribution] = await Promise.all([
      tx.booking.findUnique({ where: { id: bookingId }, select: bookingForEvent }),
      tx.bookingAttribution.findUnique({
        where: { bookingId },
        select: { consentAnalytics: true, consentMarketing: true, visitorId: true },
      }),
    ]);
    await tx.$executeRawUnsafe('RELEASE SAVEPOINT marketing_lookup');
  } catch (err) {
    await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT marketing_lookup').catch(() => undefined);
    console.error(`[marketing] could not build ${eventName} for ${bookingId}:`, err instanceof Error ? err.message : err);
    return null;
  }
  if (!booking) return null;
  const leg = booking.tripType === 'ROUND_TRIP' ? booking.outboundLeg : booking.leg;
  const passengers = passengersFromNotes(booking.notes);
  const legs = booking.tripType === 'ROUND_TRIP' ? 2 : 1;
  return recordMarketingEvent(tx, {
    eventName,
    eventId: extra.eventId,
    bookingId,
    refundId: extra.refundId ?? null,
    occurredAt: extra.occurredAt,
    operatorId: booking.operatorId,
    routeCode: leg ? `${leg.schedule.originPort}-${leg.schedule.destinationPort}` : null,
    legId: booking.legId ?? booking.outboundLegId,
    departureDate: leg?.departureDate ?? null,
    passengerCount: passengers.length || null,
    currency: booking.currency,
    value: extra.value === undefined ? booking.totalAmount : extra.value,
    visitorId: attribution?.visitorId ?? null,
    consent: {
      analytics: attribution?.consentAnalytics ?? false,
      marketing: attribution?.consentMarketing ?? false,
      decided: Boolean(attribution),
    },
    properties: {
      trip_type: booking.tripType,
      legs,
      passenger_legs: passengers.length * legs,
      infants: passengers.filter((p) => p.type === 'INFANT').length,
      ...extra.properties,
    },
  });
}

/**
 * For call sites that are not inside a transaction (savepoints need one).
 * Swallows every error: the caller's own work has already committed.
 */
export async function recordBookingEventStandalone(
  eventName: EventName,
  bookingId: string,
  extra: Parameters<typeof recordBookingEvent>[3] = {},
): Promise<string | null> {
  if (!eventsEnabled()) return null;
  try {
    const { prisma } = await import('@/shared/server/db');
    return await prisma.$transaction((tx) => recordBookingEvent(tx, eventName, bookingId, extra));
  } catch (err) {
    console.error(`[marketing] could not record ${eventName} for ${bookingId}:`, err instanceof Error ? err.message : err);
    return null;
  }
}
