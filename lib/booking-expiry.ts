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

/**
 * How long a pending PayPal order is double-checked against PayPal before the
 * booking is allowed to expire normally. Bounded so an unreachable PayPal
 * cannot hold seats indefinitely.
 */
const PAYPAL_VERIFY_WINDOW_MS = 24 * 60 * 60 * 1000;

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
    select: {
      id: true,
      createdAt: true,
      payment: {
        select: { gatewayProvider: true, gatewayReference: true, status: true },
      },
    },
    take: 200,
  });
  if (stale.length === 0) return 0;

  let expired = 0;
  for (const { id, createdAt, payment } of stale) {
    // PayPal takes the money client-side, so an order can be paid while our
    // webhook is still in flight. Expiring it would release seats the customer
    // has already paid for — the one outcome here we cannot undo.
    if (
      payment?.gatewayProvider === "PAYPAL" &&
      payment.gatewayReference &&
      payment.status === "PENDING" &&
      now - createdAt.getTime() < PAYPAL_VERIFY_WINDOW_MS
    ) {
      const settled = await settlePendingPaypalOrder(id, payment.gatewayReference);
      if (settled) continue;
    }

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

/**
 * Ask PayPal whether a pending order was in fact paid. Returns true when the
 * booking must be spared from expiry — either because it was captured (and is
 * now ticketed) or because we could not reach PayPal to find out.
 *
 * Failing to reach PayPal deliberately spares the booking: a seat held slightly
 * too long is recoverable, a paid customer losing their seat is not.
 */
async function settlePendingPaypalOrder(
  bookingId: string,
  orderId: string,
): Promise<boolean> {
  try {
    const { getOrder, isPaypalMock } = await import("./paypal");
    if (isPaypalMock()) return false;

    const order = await getOrder(orderId);
    if (!order.completed) return false;

    const { confirmPaymentAndIssueTickets } = await import("./ticket-issuer");
    await confirmPaymentAndIssueTickets({
      bookingId,
      paidAt: new Date(),
      method: "PAYPAL",
      gatewayReference: orderId,
    });
    console.warn(
      `[booking-expiry] rescued paid PayPal booking ${bookingId} from expiry`,
    );
    return true;
  } catch (err) {
    console.error(
      `[booking-expiry] could not verify PayPal order ${orderId}; sparing booking:`,
      err,
    );
    return true;
  }
}
