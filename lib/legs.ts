import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { audit } from "./audit";
import {
  OPERATOR_TIMEZONE,
  isoDayOfWeek,
  localDateTimeToUtc,
  ymdInZone,
} from "./datetime";

const DEFAULT_DAYS_AHEAD = 14;

/**
 * Demo season: all dummy departures are constrained to July–August of the
 * seeding year (WITA). Derived from the reference date so re-seeding in a later
 * year targets that year's season.
 */
export function demoSeasonWindow(ref: Date = new Date()): {
  start: Date;
  end: Date;
} {
  const year = Number(ymdInZone(ref).slice(0, 4));
  return {
    start: localDateTimeToUtc(`${year}-07-01`, "00:00"),
    end: localDateTimeToUtc(`${year}-08-31`, "23:59"),
  };
}

/**
 * Seed helper: start at the later of `ref` and the season start, and return a
 * `daysAhead` that reaches the season end — so a seed fills the whole remaining
 * in-season window instead of only the next 14 days.
 */
export function seasonSeedParams(ref: Date = new Date()): {
  startAt: Date;
  daysAhead: number;
} {
  const { start, end } = demoSeasonWindow(ref);
  const startAt = ref.getTime() < start.getTime() ? start : ref;
  const daysAhead = Math.max(
    0,
    Math.ceil((end.getTime() - startAt.getTime()) / 86_400_000) + 1,
  );
  return { startAt, daysAhead };
}

/**
 * Generate concrete Leg rows for the next `daysAhead` days from a Schedule.
 * Idempotent — the unique (scheduleId, departureDate) constraint catches
 * dupes if you re-run it. Returns the count of newly-created legs.
 *
 * @param startAt — override the reference "now" for leg generation.
 *   Used during seeding to inject departures starting from a custom point
 *   in time (e.g. "today at 06:00 WITA") rather than the current wall-clock,
 *   so that even when seeding in the evening, morning legs still get generated.
 */
export async function generateLegsForSchedule(
  scheduleId: string,
  daysAhead = DEFAULT_DAYS_AHEAD,
  startAt?: Date,
): Promise<number> {
  const schedule = await prisma.schedule.findUnique({
    where: { id: scheduleId },
    include: { boat: true },
  });
  if (!schedule) throw new Error(`Schedule ${scheduleId} not found`);
  if (schedule.status !== "ACTIVE") return 0;
  if (schedule.boat.status !== "ACTIVE") return 0;

  const now = startAt ?? new Date();
  const todayLocalYmd = ymdInZone(now);
  // Dummy departures exist only within the July–August demo season.
  const season = demoSeasonWindow(now);

  let created = 0;
  for (let offset = 0; offset < daysAhead; offset++) {
    const candidateUtc = new Date(now.getTime() + offset * 86_400_000);
    const localYmd = offset === 0 ? todayLocalYmd : ymdInZone(candidateUtc);

    // Build departure for this date+time in the operator's zone, then convert
    // back to UTC for storage.
    const departureUtc = localDateTimeToUtc(localYmd, schedule.departureTime);
    if (departureUtc.getTime() <= now.getTime()) continue;
    if (
      departureUtc.getTime() < season.start.getTime() ||
      departureUtc.getTime() > season.end.getTime()
    ) {
      continue;
    }

    const dow = isoDayOfWeek(departureUtc);
    if (!schedule.daysOfWeek.includes(dow)) continue;

    try {
      await prisma.leg.create({
        data: {
          scheduleId: schedule.id,
          operatorId: schedule.boat.operatorId,
          departureDate: departureUtc,
          totalCapacity: schedule.boat.capacity,
          availableSeats: schedule.boat.capacity,
          basePrice: schedule.basePrice,
          status: "OPEN",
        },
      });
      created++;
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        // Already exists — fine, idempotent.
        continue;
      }
      throw err;
    }
  }
  return created;
}

/**
 * Cancel a leg. Marks the leg CANCELLED, transitions every confirmed booking
 * to CANCELLED_BY_OPERATOR, marks every issued ticket REFUNDED, and stages a
 * Refund row per booking with status=PENDING. Phase 4 picks those up and
 * actually calls the payment gateway.
 *
 * All mutations run inside a transaction so a partial failure rolls back.
 */
export async function cancelLeg(args: {
  legId: string;
  reason: string;
  operatorId: string;
}): Promise<{
  cancelledBookings: number;
  pendingRefunds: number;
}> {
  const { legId, reason, operatorId } = args;

  return prisma.$transaction(async (tx) => {
    const leg = await tx.leg.findUnique({
      where: { id: legId },
    });
    if (!leg) throw new Error("Leg not found");
    if (leg.operatorId !== operatorId) {
      throw new Error("Not authorised for this leg");
    }
    if (leg.status === "CANCELLED") {
      return { cancelledBookings: 0, pendingRefunds: 0 };
    }
    if (leg.status === "SAILED") {
      throw new Error("Cannot cancel a leg that has already sailed");
    }

    await tx.leg.update({
      where: { id: legId },
      data: {
        status: "CANCELLED",
        cancellationReason: reason,
      },
    });

    const bookings = await tx.booking.findMany({
      where: { legId, status: "CONFIRMED" },
      include: { tickets: true, payment: true, refund: true },
    });

    for (const booking of bookings) {
      await tx.booking.update({
        where: { id: booking.id },
        data: { status: "CANCELLED_BY_OPERATOR" },
      });
      await tx.ticket.updateMany({
        where: { bookingId: booking.id, status: { in: ["ISSUED"] } },
        data: { status: "REFUNDED" },
      });
      if (!booking.refund) {
        await tx.refund.create({
          data: {
            bookingId: booking.id,
            originalAmount: booking.totalAmount,
            refundAmount: booking.totalAmount, // 100% per §6.4
            reason: "OPERATOR_CANCELLATION",
            status: "PENDING",
          },
        });
      }
    }

    await tx.auditLog.create({
      data: {
        entityType: "LEG",
        entityId: legId,
        action: "cancelled",
        userId: operatorId,
        userRole: "OPERATOR",
        previousState: { status: leg.status },
        newState: { status: "CANCELLED", reason },
      },
    });

    return {
      cancelledBookings: bookings.length,
      pendingRefunds: bookings.filter((b) => !b.refund).length,
    };
  });
}

export { OPERATOR_TIMEZONE };
