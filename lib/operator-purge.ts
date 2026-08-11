import type { Prisma } from "@prisma/client";
import { prisma } from "./db";

/**
 * Hard-deleting anything in the catalogue means walking its subtree bottom-up
 * by hand: every foreign key into Operator, Boat and Schedule is
 * `onDelete: Restrict`, so a plain delete fails at the first child row.
 *
 * That walk is twenty ordered steps and the order is load-bearing, so it lives
 * here once. The admin server action and the bulk purge script both call it
 * rather than keeping two copies that drift apart.
 *
 * The subtree reaches Payment, Refund and Ticket — the record of money that
 * actually moved. Callers are expected to check `subtreeBlockers` first and
 * refuse when any exist; nothing here enforces that, because the boat-level
 * and operator-level callers word their refusals differently.
 */

export type Subtree = {
  boatIds: string[];
  scheduleIds: string[];
  legIds: string[];
  bookingIds: string[];
};

export type PurgeBlockers = {
  payments: number;
  refunds: number;
  tickets: number;
  liveBookings: number;
};

export type PurgeCounts = {
  bookings: number;
  legs: number;
  schedules: number;
  boats: number;
  staff: number;
  promotionsRetargeted: number;
};

const EMPTY: Subtree = { boatIds: [], scheduleIds: [], legIds: [], bookingIds: [] };

/**
 * Everything hanging off a specific set of boats, and nothing else.
 *
 * Legs are matched through their schedule only — never through
 * `Leg.operatorId` — because this is the collector used to remove some of an
 * operator's boats while the operator keeps trading. Matching on the operator
 * would sweep up the legs of the boats being kept.
 */
export async function collectBoatSubtree(boatIds: string[]): Promise<Subtree> {
  if (boatIds.length === 0) return EMPTY;

  const scheduleIds = (
    await prisma.schedule.findMany({
      where: { boatId: { in: boatIds } },
      select: { id: true },
    })
  ).map((s) => s.id);

  const legIds = scheduleIds.length
    ? (
        await prisma.leg.findMany({
          where: { scheduleId: { in: scheduleIds } },
          select: { id: true },
        })
      ).map((l) => l.id)
    : [];

  const bookingIds = legIds.length
    ? (
        await prisma.booking.findMany({
          where: { legId: { in: legIds } },
          select: { id: true },
        })
      ).map((b) => b.id)
    : [];

  return { boatIds, scheduleIds, legIds, bookingIds };
}

/**
 * Everything hanging off an operator.
 *
 * `Leg` and `Booking` carry a denormalised `operatorId`, so each is matched on
 * both that and its parent chain. A row that disagrees with its parent still
 * gets swept up instead of blocking the delete with a foreign key error
 * halfway through the transaction.
 */
export async function collectOperatorSubtree(operatorId: string): Promise<Subtree> {
  const boatIds = (
    await prisma.boat.findMany({ where: { operatorId }, select: { id: true } })
  ).map((b) => b.id);

  const scheduleIds = boatIds.length
    ? (
        await prisma.schedule.findMany({
          where: { boatId: { in: boatIds } },
          select: { id: true },
        })
      ).map((s) => s.id)
    : [];

  const legIds = (
    await prisma.leg.findMany({
      where: {
        OR: [
          { operatorId },
          ...(scheduleIds.length ? [{ scheduleId: { in: scheduleIds } }] : []),
        ],
      },
      select: { id: true },
    })
  ).map((l) => l.id);

  const bookingIds = (
    await prisma.booking.findMany({
      where: {
        OR: [
          { operatorId },
          ...(legIds.length ? [{ legId: { in: legIds } }] : []),
        ],
      },
      select: { id: true },
    })
  ).map((b) => b.id);

  return { boatIds, scheduleIds, legIds, bookingIds };
}

export async function subtreeBlockers(s: Subtree): Promise<PurgeBlockers> {
  const bookingId = { in: s.bookingIds };
  const [payments, refunds, tickets, liveBookings] = await Promise.all([
    prisma.payment.count({ where: { bookingId } }),
    prisma.refund.count({ where: { bookingId } }),
    prisma.ticket.count({ where: { bookingId } }),
    prisma.booking.count({
      where: {
        id: { in: s.bookingIds },
        status: { in: ["CONFIRMED", "PENDING_PAYMENT"] },
        leg: { departureDate: { gte: new Date() } },
      },
    }),
  ]);
  return { payments, refunds, tickets, liveBookings };
}

/** Human-readable list of the money rows that forbid a purge, empty if clean. */
export function describeMoneyBlockers(b: PurgeBlockers): string[] {
  const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;
  return [
    b.payments ? plural(b.payments, "payment") : null,
    b.refunds ? plural(b.refunds, "refund") : null,
    b.tickets ? plural(b.tickets, "issued ticket") : null,
  ].filter((x): x is string => x !== null);
}

/**
 * Delete the catalogue rows in a subtree. Leaves the operator row and its
 * operator-level children alone — `purgeOperator` handles those.
 */
async function deleteSubtreeRows(tx: Prisma.TransactionClient, s: Subtree) {
  const byLeg = { legId: { in: s.legIds } };
  const byBooking = { bookingId: { in: s.bookingIds } };

  await tx.seatHold.deleteMany({ where: byLeg });
  await tx.weatherSnapshot.deleteMany({ where: byLeg });

  await tx.promotionRedemption.deleteMany({ where: byBooking });
  await tx.bookingAddon.deleteMany({ where: byBooking });
  // A reschedule request points at two legs as well as its booking, so one that
  // moved a customer onto a departure here blocks the leg delete even when the
  // booking itself belongs to another operator.
  await tx.rescheduleRequest.deleteMany({
    where: {
      OR: [
        byBooking,
        { originalLegId: { in: s.legIds } },
        { requestedLegId: { in: s.legIds } },
      ],
    },
  });
  // Same shape one level up: Review references the schedule directly.
  await tx.review.deleteMany({
    where: { OR: [byBooking, { scheduleId: { in: s.scheduleIds } }] },
  });

  const bookings = await tx.booking.deleteMany({ where: { id: { in: s.bookingIds } } });
  const legs = await tx.leg.deleteMany({ where: { id: { in: s.legIds } } });

  await tx.transitStop.deleteMany({ where: { scheduleId: { in: s.scheduleIds } } });
  const schedules = await tx.schedule.deleteMany({ where: { id: { in: s.scheduleIds } } });

  await tx.boatFacilitiesOnBoat.deleteMany({ where: { boatId: { in: s.boatIds } } });
  await tx.boatPosition.deleteMany({ where: { boatId: { in: s.boatIds } } });
  const boats = await tx.boat.deleteMany({ where: { id: { in: s.boatIds } } });

  return {
    bookings: bookings.count,
    legs: legs.count,
    schedules: schedules.count,
    boats: boats.count,
  };
}

/** Remove specific boats and their sailings, leaving their operator trading. */
export async function purgeBoats(s: Subtree): Promise<PurgeCounts> {
  return prisma.$transaction(
    async (tx) => ({
      ...(await deleteSubtreeRows(tx, s)),
      staff: 0,
      promotionsRetargeted: 0,
    }),
    { timeout: 30_000 },
  );
}

/** Remove an operator and everything beneath it. */
export async function purgeOperator(
  operatorId: string,
  s: Subtree,
): Promise<PurgeCounts> {
  return prisma.$transaction(
    async (tx) => {
      const counts = await deleteSubtreeRows(tx, s);

      // Cash drawer sessions hang off both the operator and its staff, so they
      // have to go before either.
      await tx.cashDrawerSession.deleteMany({ where: { operatorId } });
      const staff = await tx.operatorStaff.deleteMany({ where: { operatorId } });
      await tx.travelAgent.deleteMany({ where: { operatorId } });
      await tx.operatorDocument.deleteMany({ where: { operatorId } });
      await tx.operatorNotification.deleteMany({ where: { operatorId } });
      await tx.operatorServicesOnOperator.deleteMany({ where: { operatorId } });

      await tx.operator.delete({ where: { id: operatorId } });

      // No foreign key backs this array, so the id survives the delete and
      // would keep silently narrowing a promotion to an operator that is gone.
      const targeted = await tx.promotion.findMany({
        where: { appliesToOperatorIds: { has: operatorId } },
        select: { id: true, appliesToOperatorIds: true },
      });
      for (const promo of targeted) {
        await tx.promotion.update({
          where: { id: promo.id },
          data: {
            appliesToOperatorIds: promo.appliesToOperatorIds.filter(
              (x) => x !== operatorId,
            ),
          },
        });
      }

      return { ...counts, staff: staff.count, promotionsRetargeted: targeted.length };
    },
    { timeout: 30_000 },
  );
}
