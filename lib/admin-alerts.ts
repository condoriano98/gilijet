import { prisma } from "./db";
import { env } from "./env";
import { formatLocalDateTime } from "./datetime";
import { formatIDR } from "./utils";
import { sendTemplateMessage } from "./whatsapp";

/**
 * WhatsApp alerts to whoever is on call for bookings.
 *
 * Sent as a WATI template, not a session message: WhatsApp only lets a
 * business open a conversation with a pre-approved template, and a session
 * message reaches someone only within 24 hours of *them* messaging in. Staff
 * never do, so a session message here would fail every time — silently.
 *
 * Destination and template name resolve database-first so the on-call number
 * can move between staff at /admin/console/alerts without a redeploy; env
 * supplies the fallback for a fresh environment with no config row yet.
 *
 * Every function swallows its own errors. An alert is a convenience for staff;
 * failing to send one must never roll back the booking or payment that
 * triggered it.
 */

export type AlertEvent = "new_booking" | "booking_paid";

type AlertConfig = {
  number: string;
  template: string;
  onNewBooking: boolean;
  onBookingPaid: boolean;
};

async function resolveConfig(): Promise<AlertConfig | null> {
  let row = null;
  try {
    row = await prisma.platformConfig.findUnique({ where: { id: "default" } });
  } catch (err) {
    // A missing config row is normal; an unreachable database is not, but it
    // must not take the booking down with it.
    console.error("[admin-alert] could not read platform config:", err);
  }

  const number = row?.adminWhatsappNumber?.trim() || env.ADMIN_WHATSAPP_NUMBER;
  const template = row?.adminAlertTemplate?.trim() || env.ADMIN_ALERT_TEMPLATE;
  if (!number || !template) return null;

  return {
    number,
    template,
    onNewBooking: row?.alertOnNewBooking ?? true,
    onBookingPaid: row?.alertOnBookingPaid ?? true,
  };
}

const bookingForAlert = {
  bookingReference: true,
  customerName: true,
  customerPhone: true,
  totalAmount: true,
  notes: true,
  leg: {
    select: {
      departureDate: true,
      schedule: {
        select: {
          originPort: true,
          destinationPort: true,
          boat: { select: { name: true } },
        },
      },
    },
  },
} as const;

function passengerCount(notes: string | null): number {
  if (!notes) return 0;
  try {
    const parsed = JSON.parse(notes) as { passengers?: unknown[] };
    return Array.isArray(parsed.passengers) ? parsed.passengers.length : 0;
  } catch {
    return 0;
  }
}

/**
 * One template serves both events, with `event` and `action` carrying the
 * difference. That is deliberate: every template needs separate approval from
 * WhatsApp, and one approval is a great deal less friction than two.
 */
async function alert(bookingId: string, event: AlertEvent): Promise<void> {
  try {
    const config = await resolveConfig();
    if (!config) return;
    if (event === "new_booking" && !config.onNewBooking) return;
    if (event === "booking_paid" && !config.onBookingPaid) return;

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      select: bookingForAlert,
    });
    if (!booking) return;

    const paid = event === "booking_paid";
    await sendTemplateMessage({
      to: config.number,
      templateName: config.template,
      broadcastName: `gilifast_${event}`,
      params: {
        event: paid ? "PAID — confirm with operator" : "New booking (unpaid)",
        reference: booking.bookingReference,
        route: `${booking.leg.schedule.originPort} → ${booking.leg.schedule.destinationPort}`,
        departure: `${formatLocalDateTime(booking.leg.departureDate)} WITA`,
        boat: booking.leg.schedule.boat.name,
        customer: `${booking.customerName} (${booking.customerPhone})`,
        pax: String(passengerCount(booking.notes)),
        amount: formatIDR(Number(booking.totalAmount)),
        action: paid
          ? `${env.APP_BASE_URL}/admin/confirmations`
          : "No action yet — awaiting payment",
      },
    });
  } catch (err) {
    console.error(`[admin-alert] ${event} alert failed:`, err);
  }
}

/** A seat has been reserved. Not yet paid, and may expire unpaid. */
export function alertAdminNewBooking(bookingId: string): Promise<void> {
  return alert(bookingId, "new_booking");
}

/** Money has settled. This is the one that needs an operator phone call. */
export function alertAdminBookingPaid(bookingId: string): Promise<void> {
  return alert(bookingId, "booking_paid");
}
