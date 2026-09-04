import { prisma } from "./db";
import { formatLocalDateTime } from "./datetime";
import { formatIDR } from "./utils";
import { sendTemplateMessage } from "./whatsapp";
import { WHATSAPP_TEMPLATE } from "./whatsapp-templates";

/**
 * WhatsApp alerts to the boat operator.
 *
 * Operators on this platform work entirely by phone and do not use the
 * dashboard, so a WhatsApp template is the only reliable channel to reach
 * them. The admin still makes the confirming phone call — these messages give
 * the operator the context for that call, and the outcome afterwards.
 *
 * Like admin alerts, every function swallows its own errors: an alert is a
 * convenience for the operator, and a failed send must never roll back the
 * booking or payment that triggered it.
 */

export type OperatorAlertEvent = "booking_paid" | "booking_confirmed";

const bookingForOperatorAlert = {
  id: true,
  bookingReference: true,
  customerName: true,
  totalAmount: true,
  notes: true,
  leg: {
    select: {
      departureDate: true,
      schedule: {
        select: {
          originPort: true,
          destinationPort: true,
          boat: {
            select: {
              name: true,
              operator: { select: { phoneNumber: true } },
            },
          },
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

async function alert(bookingId: string, event: OperatorAlertEvent): Promise<void> {
  try {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      select: bookingForOperatorAlert,
    });
    const phone = booking?.leg.schedule.boat.operator.phoneNumber;
    if (!booking || !phone) return;

    const common = {
      route: `${booking.leg.schedule.originPort} → ${booking.leg.schedule.destinationPort}`,
      departure: `${formatLocalDateTime(booking.leg.departureDate)} WITA`,
      boat: booking.leg.schedule.boat.name,
      pax: String(passengerCount(booking.notes)),
      customer: booking.customerName,
      reference: booking.bookingReference,
      amount: formatIDR(Number(booking.totalAmount)),
    };

    const paid = event === "booking_paid";
    await sendTemplateMessage({
      to: phone,
      templateName: paid
        ? WHATSAPP_TEMPLATE.OPERATOR_BOOKING_PAID
        : WHATSAPP_TEMPLATE.OPERATOR_BOOKING_CONFIRMED,
      broadcastName: `gilifast_operator_${event}`,
      // Insertion order is the Meta positional parameter order.
      params: paid
        ? {
            route: common.route,
            departure: common.departure,
            boat: common.boat,
            pax: common.pax,
            customer: common.customer,
            reference: common.reference,
            amount: common.amount,
          }
        : {
            route: common.route,
            departure: common.departure,
            boat: common.boat,
            pax: common.pax,
            reference: common.reference,
          },
    });
  } catch (err) {
    console.error(`[operator-alert] ${event} alert failed:`, err);
  }
}

/** Money has settled; the admin is about to ring the operator to confirm. */
export function alertOperatorBookingPaid(bookingId: string): Promise<void> {
  return alert(bookingId, "booking_paid");
}

/** The admin confirmed availability and the boarding passes went out. */
export function alertOperatorBookingConfirmed(bookingId: string): Promise<void> {
  return alert(bookingId, "booking_confirmed");
}
