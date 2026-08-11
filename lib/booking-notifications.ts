import { prisma } from "./db";
import { env } from "./env";
import {
  sendBookingConfirmation,
  sendCancellationEmail,
  sendPaymentReceivedEmail,
} from "./email";
import {
  sendBoardingPassWhatsapp,
  sendOperatorUnavailableWhatsapp,
  sendPaymentReceivedWhatsapp,
} from "./whatsapp";
import type { IssuedTicket } from "./ticket-issuer";

/**
 * Customer-facing notifications for the booking lifecycle, fanned out over
 * email and WhatsApp together.
 *
 * Every function here swallows its own transport errors. These are called from
 * webhooks and server actions where a failed send must not roll back the state
 * change that prompted it — a customer whose WhatsApp bounced still has a
 * confirmed seat, and re-sending is a support action, not a retry loop.
 */

const bookingForNotify = {
  id: true,
  bookingReference: true,
  customerName: true,
  customerEmail: true,
  customerPhone: true,
  totalAmount: true,
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

async function load(bookingId: string) {
  return prisma.booking.findUnique({
    where: { id: bookingId },
    select: bookingForNotify,
  });
}

function lookupUrl(reference: string): string {
  return `${env.APP_BASE_URL}/b/${reference}`;
}

/** Money has settled; the seat is not promised yet. No QR in either channel. */
export async function notifyPaymentReceived(bookingId: string): Promise<void> {
  const booking = await load(bookingId);
  if (!booking) return;
  const url = lookupUrl(booking.bookingReference);

  await Promise.allSettled([
    sendPaymentReceivedEmail({
      to: booking.customerEmail,
      customerName: booking.customerName,
      bookingReference: booking.bookingReference,
      route: {
        originPort: booking.leg.schedule.originPort,
        destinationPort: booking.leg.schedule.destinationPort,
      },
      boatName: booking.leg.schedule.boat.name,
      departureDate: booking.leg.departureDate,
      totalAmount: Number(booking.totalAmount),
      lookupUrl: url,
    }),
    sendPaymentReceivedWhatsapp({
      to: booking.customerPhone,
      customerName: booking.customerName,
      bookingReference: booking.bookingReference,
      lookupUrl: url,
    }),
  ]).then(logFailures("payment-received"));
}

/** The admin reached the operator and the seat is real. Boarding pass goes out. */
export async function notifyBoardingPassIssued(
  bookingId: string,
  tickets: IssuedTicket[],
): Promise<void> {
  const booking = await load(bookingId);
  if (!booking) return;
  const url = lookupUrl(booking.bookingReference);

  await Promise.allSettled([
    sendBookingConfirmation({
      to: booking.customerEmail,
      customerName: booking.customerName,
      bookingReference: booking.bookingReference,
      route: {
        originPort: booking.leg.schedule.originPort,
        destinationPort: booking.leg.schedule.destinationPort,
      },
      boatName: booking.leg.schedule.boat.name,
      departureDate: booking.leg.departureDate,
      totalAmount: Number(booking.totalAmount),
      lookupUrl: url,
      tickets,
    }),
    sendBoardingPassWhatsapp({
      to: booking.customerPhone,
      customerName: booking.customerName,
      bookingReference: booking.bookingReference,
      route: {
        originPort: booking.leg.schedule.originPort,
        destinationPort: booking.leg.schedule.destinationPort,
      },
      boatName: booking.leg.schedule.boat.name,
      departureDate: booking.leg.departureDate,
      ticketCodes: tickets.map((t) => t.ticketCode),
      lookupUrl: url,
    }),
  ]).then(logFailures("boarding-pass"));
}

/** The operator cannot take the booking; a full refund is already queued. */
export async function notifyOperatorUnavailable(
  bookingId: string,
  refundAmount: number,
): Promise<void> {
  const booking = await load(bookingId);
  if (!booking) return;
  const url = lookupUrl(booking.bookingReference);

  await Promise.allSettled([
    sendCancellationEmail({
      to: booking.customerEmail,
      customerName: booking.customerName,
      bookingReference: booking.bookingReference,
      route: {
        originPort: booking.leg.schedule.originPort,
        destinationPort: booking.leg.schedule.destinationPort,
      },
      departureDate: booking.leg.departureDate,
      refundAmount,
      // The customer did not cancel, so the time-tier table never applies.
      refundTier: "FULL",
      lookupUrl: url,
    }),
    sendOperatorUnavailableWhatsapp({
      to: booking.customerPhone,
      customerName: booking.customerName,
      bookingReference: booking.bookingReference,
      lookupUrl: url,
    }),
  ]).then(logFailures("operator-unavailable"));
}

function logFailures(label: string) {
  return (results: PromiseSettledResult<unknown>[]) => {
    for (const r of results) {
      if (r.status === "rejected") {
        console.error(`[notify:${label}] send failed:`, r.reason);
      }
    }
  };
}
