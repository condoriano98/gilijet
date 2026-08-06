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
 * How far ahead the nightly top-up keeps departures bookable.
 *
 * This is a rolling window, deliberately not the July–August `demoSeasonWindow`
 * below. The top-up cron used to run on season params, which meant it produced
 * nothing at all from roughly September until the following July — schedules
 * kept their first 14 days of legs from creation and then quietly ran dry.
 */
export const BOOKING_HORIZON_DAYS = 60;

export type CapacityChange =
  | { ok: true; totalCapacity: number; availableSeats: number }
  | { ok: false; booked: number };

/**
 * Work out the new seat counts when someone resizes a departure.
 *
 * `availableSeats` is not derivable from capacity alone — the difference from
 * `totalCapacity` is what has already been sold — so a resize has to move both
 * together or seats are silently created or destroyed. Shrinking below the
 * number already booked is refused rather than clamped: clamping would look
 * like it worked while overselling the boat.
 */
export function planCapacityChange(
  leg: { totalCapacity: number; availableSeats: number },
  newTotal: number,
): CapacityChange {
  const booked = leg.totalCapacity - leg.availableSeats;
  if (newTotal < booked) return { ok: false, booked };
  return { ok: true, totalCapacity: newTotal, availableSeats: newTotal - booked };
}

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
 * The window is `startAt` + `daysAhead` and nothing else. This used to also
 * clamp every departure to `demoSeasonWindow`, which is fine for dummy data but
 * silently truncated real schedules at 31 August — the top-up cron would ask for
 * 60 days, get only the in-season part, and the site would run dry in September.
 * Seeds still confine themselves to July–August by passing `seasonSeedParams()`.
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

  const toCreate: Prisma.LegCreateManyInput[] = [];
  for (let offset = 0; offset < daysAhead; offset++) {
    const candidateUtc = new Date(now.getTime() + offset * 86_400_000);
    const localYmd = offset === 0 ? todayLocalYmd : ymdInZone(candidateUtc);

    // Build departure for this date+time in the operator's zone, then convert
    // back to UTC for storage.
    const departureUtc = localDateTimeToUtc(localYmd, schedule.departureTime);
    if (departureUtc.getTime() <= now.getTime()) continue;

    const dow = isoDayOfWeek(departureUtc);
    if (!schedule.daysOfWeek.includes(dow)) continue;

    toCreate.push({
      scheduleId: schedule.id,
      operatorId: schedule.boat.operatorId,
      departureDate: departureUtc,
      totalCapacity: schedule.boat.capacity,
      availableSeats: schedule.boat.capacity,
      basePrice: schedule.basePrice,
      status: "OPEN",
    });
  }

  if (toCreate.length === 0) return 0;
  // Batch insert; skipDuplicates keeps it idempotent against the unique
  // (scheduleId, departureDate) constraint.
  const result = await prisma.leg.createMany({
    data: toCreate,
    skipDuplicates: true,
  });
  return result.count;
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
