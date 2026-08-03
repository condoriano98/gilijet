import { prisma } from "./db";
import { env } from "./env";
import { releaseBookingSeats } from "./booking-engine";

/**
 * Expire bookings whose `PENDING_PAYMENT` hold has elapsed. Called lazily
 * from customer-facing reads (search, leg detail, booking lookup) so we
 * don't need a separate cron in MVP.
 *
 * Idempotent and rate-limited via an in-process timestamp so each request
 * doesn't pile up redundant transactions.
 */

let lastSweepAt = 0;
const SWEEP_MIN_INTERVAL_MS = 30_000;

export async function expireStalePendingBookings(): Promise<number> {
  const now = Date.now();
  if (now - lastSweepAt < SWEEP_MIN_INTERVAL_MS) return 0;
  lastSweepAt = now;

  const cutoff = new Date(
    now - env.BOOKING_HOLD_MINUTES * 60 * 1000,
  );

  const stale = await prisma.booking.findMany({
    where: {
      status: "PENDING_PAYMENT",
      createdAt: { lt: cutoff },
    },
    select: { id: true },
    take: 200,
  });
  if (stale.length === 0) return 0;

  let expired = 0;
  for (const { id } of stale) {
    try {
      await prisma.booking.update({
        where: { id, status: "PENDING_PAYMENT" },
        data: { status: "EXPIRED" },
      });
      await releaseBookingSeats(id, "expired");
      expired++;
    } catch {
      // Another request may have raced us — skip.
    }
  }
  return expired;
}
