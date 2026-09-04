import { prisma } from "./db";
import { env } from "./env";
import {
  sendBookingConfirmation,
  sendCancellationEmail,
  sendPaymentReceivedEmail,
} from "./email";
import {
  sendBoardingPassDocument,
  sendBoardingPassWhatsapp,
  sendOperatorUnavailableWhatsapp,
  sendPaymentReceivedWhatsapp,
} from "./whatsapp";
import {
  boardingPassFilename,
  generateBoardingPassPdf,
} from "./boarding-pass";
import { alertAdminBookingPaid } from "./admin-alerts";
import {
  alertOperatorBookingPaid,
  alertOperatorBookingConfirmed,
} from "./operator-alerts";
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

  // Staff alert: this is the moment the admin has something to do — ring the
  // operator and confirm the boat. The operator gets their own WhatsApp alert
  // so the incoming call has context. Both swallow their own errors.
  void alertAdminBookingPaid(bookingId);
  void alertOperatorBookingPaid(bookingId);
}

/** The admin reached the operator and the seat is real. Boarding pass goes out. */
export async function notifyBoardingPassIssued(
  bookingId: string,
  tickets: IssuedTicket[],
): Promise<void> {
  const booking = await load(bookingId);
  if (!booking) return;
  const url = lookupUrl(booking.bookingReference);
  const route = {
    originPort: booking.leg.schedule.originPort,
    destinationPort: booking.leg.schedule.destinationPort,
  };

  // Rendered once and shared by both channels — it is the same document, and
  // generating it twice would double the work on the admin's approve click.
  // A failure here must not cost the customer their confirmation, so it falls
  // back to the link-only WhatsApp message rather than sending nothing.
  let pdf: Buffer | null = null;
  try {
    pdf = await generateBoardingPassPdf(booking.bookingReference);
  } catch (err) {
    console.error("[notify:boarding-pass] PDF generation failed:", err);
  }
  const filename = boardingPassFilename(booking.bookingReference);

  await Promise.allSettled([
    sendBookingConfirmation({
      to: booking.customerEmail,
      customerName: booking.customerName,
      bookingReference: booking.bookingReference,
      route,
      boatName: booking.leg.schedule.boat.name,
      departureDate: booking.leg.departureDate,
      totalAmount: Number(booking.totalAmount),
      lookupUrl: url,
      tickets,
      attachments: pdf ? [{ filename, content: pdf }] : undefined,
    }),
    pdf
      ? sendBoardingPassDocument({
          to: booking.customerPhone,
          customerName: booking.customerName,
          bookingReference: booking.bookingReference,
          route,
          departureDate: booking.leg.departureDate,
          pdf,
          filename,
        })
      : sendBoardingPassWhatsapp({
          to: booking.customerPhone,
          customerName: booking.customerName,
          bookingReference: booking.bookingReference,
          route,
          boatName: booking.leg.schedule.boat.name,
          departureDate: booking.leg.departureDate,
          ticketCodes: tickets.map((t) => t.ticketCode),
          lookupUrl: url,
        }),
  ]).then(logFailures("boarding-pass"));

  // The operator learns the seat is real so their manifest matches ours.
  // Swallows its own errors.
  void alertOperatorBookingConfirmed(bookingId);
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
