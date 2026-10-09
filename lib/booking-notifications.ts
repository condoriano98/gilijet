import { prisma } from './db';
import { env } from './env';
import { getMainLeg, getReturnLeg } from './booking-helpers';
import {
  sendBookingConfirmation,
  sendCancellationEmail,
  sendPaymentReceivedEmail,
} from './email';
import {
  sendBoardingPassDocument,
  sendBoardingPassWhatsapp,
  sendOperatorUnavailableWhatsapp,
  sendPaymentReceivedWhatsapp,
} from './whatsapp';
import {
  boardingPassFilename,
  generateBoardingPassPdf,
  generateBoardingPassPdfsForBooking,
} from './boarding-pass';
import { alertAdminBookingPaid } from './admin-alerts';
import type { IssuedTicket } from './ticket-issuer';

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
  tripType: true,
  bookingReference: true,
  customerName: true,
  customerEmail: true,
  customerPhone: true,
  totalAmount: true,
  tickets: { select: { id: true } },
  leg: {
    select: {
      basePrice: true,
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
  outboundLeg: {
    select: {
      basePrice: true,
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
  returnLeg: {
    select: {
      basePrice: true,
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
  const mainLeg = getMainLeg(booking)!;
  const returnLeg = getReturnLeg(booking);
  const url = lookupUrl(booking.bookingReference);

  await Promise.allSettled([
    sendPaymentReceivedEmail({
      to: booking.customerEmail,
      customerName: booking.customerName,
      bookingReference: booking.bookingReference,
      route: {
        originPort: mainLeg.schedule.originPort,
        destinationPort: mainLeg.schedule.destinationPort,
      },
      boatName: mainLeg.schedule.boat.name,
      departureDate: mainLeg.departureDate,
      totalAmount: Number(booking.totalAmount),
      lookupUrl: url,
      // Round-trip support
      isRoundTrip: booking.tripType === 'ROUND_TRIP',
      returnRoute: returnLeg
        ? {
            originPort: returnLeg.schedule.originPort,
            destinationPort: returnLeg.schedule.destinationPort,
          }
        : undefined,
      returnBoatName: returnLeg ? returnLeg.schedule.boat.name : undefined,
      returnDepartureDate: returnLeg ? returnLeg.departureDate : undefined,
    }),
    sendPaymentReceivedWhatsapp({
      to: booking.customerPhone,
      customerName: booking.customerName,
      bookingReference: booking.bookingReference,
      lookupUrl: url,
    }),
  ]).then(logFailures('payment-received'));

  // Staff alert: this is the moment the admin has something to do — ring the
  // operator and confirm the boat. Swallows its own errors.
  void alertAdminBookingPaid(bookingId);
}

/** The admin reached the operator and the seat is real. Boarding pass goes out. */
export async function notifyBoardingPassIssued(
  bookingId: string,
  tickets: IssuedTicket[],
): Promise<void> {
  const booking = await load(bookingId);
  if (!booking) return;
  const mainLeg = getMainLeg(booking)!;
  const returnLeg = getReturnLeg(booking);
  const url = lookupUrl(booking.bookingReference);
  const route = {
    originPort: mainLeg.schedule.originPort,
    destinationPort: mainLeg.schedule.destinationPort,
  };

  // Generate PDFs (1 for one-way, 2 for round-trip)
  let attachments: { filename: string; content: Buffer }[] = [];
  try {
    attachments = await generateBoardingPassPdfsForBooking(booking.bookingReference);
  } catch (err) {
    console.error('[notify:boarding-pass] PDF generation failed:', err);
  }

  // Calculate individual leg prices for round-trip display
  let outboundPrice: number | undefined;
  let returnPrice: number | undefined;
  if (booking.tripType === 'ROUND_TRIP') {
    const passengerCount = booking.tickets.length;
    outboundPrice = Number(mainLeg.basePrice) * passengerCount;
    if (returnLeg) {
      returnPrice = Number(returnLeg.basePrice) * passengerCount;
    }
  }

  const returnRoute = returnLeg
    ? {
        originPort: returnLeg.schedule.originPort,
        destinationPort: returnLeg.schedule.destinationPort,
      }
    : undefined;

  // One WhatsApp document per PDF: a round trip is two passes and the
  // customer has to see both. Sent in order (outbound first), and a failure on
  // one must not stop the other from going out.
  const sendPassesOverWhatsapp = async () => {
    const legs = [
      { label: 'Berangkat' as const, route, departureDate: mainLeg.departureDate },
      ...(returnLeg && returnRoute
        ? [{ label: 'Pulang' as const, route: returnRoute, departureDate: returnLeg.departureDate }]
        : []),
    ];
    const total = attachments.length;
    for (let i = 0; i < total; i++) {
      const leg = legs[i] ?? legs[0]!;
      try {
        await sendBoardingPassDocument({
          to: booking.customerPhone,
          customerName: booking.customerName,
          bookingReference: booking.bookingReference,
          route: leg.route,
          departureDate: leg.departureDate,
          pdf: attachments[i]!.content,
          filename: attachments[i]!.filename,
          leg: total > 1 ? { label: leg.label, index: i + 1, total } : undefined,
        });
      } catch (err) {
        console.error(`[notify:boarding-pass] WhatsApp pass ${i + 1}/${total} failed:`, err);
      }
    }
  };

  await Promise.allSettled([
    sendBookingConfirmation({
      to: booking.customerEmail,
      customerName: booking.customerName,
      bookingReference: booking.bookingReference,
      route,
      boatName: mainLeg.schedule.boat.name,
      departureDate: mainLeg.departureDate,
      totalAmount: Number(booking.totalAmount),
      lookupUrl: url,
      tickets,
      attachments: attachments.length > 0 ? attachments : undefined,
      // Round-trip support
      isRoundTrip: booking.tripType === 'ROUND_TRIP',
      returnRoute: returnLeg
        ? {
            originPort: returnLeg.schedule.originPort,
            destinationPort: returnLeg.schedule.destinationPort,
          }
        : undefined,
      returnBoatName: returnLeg ? returnLeg.schedule.boat.name : undefined,
      returnDepartureDate: returnLeg ? returnLeg.departureDate : undefined,
      outboundPrice,
      returnPrice,
    }),
    attachments.length > 0
      ? sendPassesOverWhatsapp()
      : sendBoardingPassWhatsapp({
          to: booking.customerPhone,
          customerName: booking.customerName,
          bookingReference: booking.bookingReference,
          route,
          boatName: mainLeg.schedule.boat.name,
          departureDate: mainLeg.departureDate,
          ticketCodes: tickets.map((t) => t.ticketCode),
          lookupUrl: url,
          returnLeg:
            returnLeg && returnRoute
              ? {
                  route: returnRoute,
                  boatName: returnLeg.schedule.boat.name,
                  departureDate: returnLeg.departureDate,
                }
              : undefined,
        }),
  ]).then(logFailures('boarding-pass'));
}

/** The operator cannot take the booking; a full refund is already queued. */
export async function notifyOperatorUnavailable(
  bookingId: string,
  refundAmount: number,
): Promise<void> {
  const booking = await load(bookingId);
  if (!booking) return;
  const mainLeg = getMainLeg(booking)!;
  const returnLeg = getReturnLeg(booking);
  const url = lookupUrl(booking.bookingReference);

  await Promise.allSettled([
    sendCancellationEmail({
      to: booking.customerEmail,
      customerName: booking.customerName,
      bookingReference: booking.bookingReference,
      route: {
        originPort: mainLeg.schedule.originPort,
        destinationPort: mainLeg.schedule.destinationPort,
      },
      departureDate: mainLeg.departureDate,
      refundAmount,
      // The customer did not cancel, so the time-tier table never applies.
      refundTier: 'FULL',
      lookupUrl: url,
      // Round-trip support (show both legs in cancellation notice)
      isRoundTrip: booking.tripType === 'ROUND_TRIP',
      returnRoute: returnLeg
        ? {
            originPort: returnLeg.schedule.originPort,
            destinationPort: returnLeg.schedule.destinationPort,
          }
        : undefined,
      returnBoatName: returnLeg ? returnLeg.schedule.boat.name : undefined,
      returnDepartureDate: returnLeg ? returnLeg.departureDate : undefined,
    }),
    sendOperatorUnavailableWhatsapp({
      to: booking.customerPhone,
      customerName: booking.customerName,
      bookingReference: booking.bookingReference,
      lookupUrl: url,
      trip: returnLeg
        ? {
            outbound: {
              route: {
                originPort: mainLeg.schedule.originPort,
                destinationPort: mainLeg.schedule.destinationPort,
              },
              departureDate: mainLeg.departureDate,
            },
            return: {
              route: {
                originPort: returnLeg.schedule.originPort,
                destinationPort: returnLeg.schedule.destinationPort,
              },
              departureDate: returnLeg.departureDate,
            },
          }
        : undefined,
    }),
  ]).then(logFailures('operator-unavailable'));
}

/** Tell every customer whose booking a departure cancellation just cancelled. */
export async function notifyLegCancelled(
  cancelled: { bookingId: string; refundAmount: number }[],
): Promise<void> {
  const results = await Promise.allSettled(
    cancelled.map((c) => notifyOperatorUnavailable(c.bookingId, c.refundAmount)),
  );
  logFailures('leg-cancelled')(results);
}

function logFailures(label: string) {
  return (results: PromiseSettledResult<unknown>[]) => {
    for (const r of results) {
      if (r.status === 'rejected') {
        console.error(`[notify:${label}] send failed:`, r.reason);
      }
    }
  };
}
