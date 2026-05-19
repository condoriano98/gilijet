import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { env } from "./env";
import { audit } from "./audit";
import { computeBookingPrice } from "./pricing";
import { computeRefundDeadline } from "./refunds";
import { newBookingReference } from "./references";
import {
  createInvoice,
  isXenditConfigured,
  XenditNotConfiguredError,
} from "./xendit";

export class BookingError extends Error {
  constructor(
    public code:
      | "LEG_NOT_FOUND"
      | "LEG_CLOSED"
      | "LEG_PAST"
      | "SOLD_OUT"
      | "INVALID_INPUT",
    message: string,
  ) {
    super(message);
    this.name = "BookingError";
  }
}

export type BookingCustomer = {
  name: string;
  email: string;
  phone: string;
  nationality?: string | null;
};

export type BookingPassenger = {
  name: string;
  idNumber?: string | null;
};

export type CreateBookingArgs = {
  legId: string;
  customer: BookingCustomer;
  passengers: BookingPassenger[];
  idempotencyKey?: string | null;
  notes?: string | null;
};

/**
 * Atomic booking creation:
 *  - locks the leg's `availableSeats` via a conditional updateMany
 *  - bumps the leg to FULL when seats hit zero
 *  - mints a Booking + Payment row (status=PENDING_PAYMENT)
 *
 * Does NOT issue tickets — those land when Xendit confirms payment via the
 * webhook (or the mock-pay endpoint in dev). Returns the booking row so the
 * caller can kick off the Xendit invoice afterwards.
 */
export async function reserveSeatsAndCreateBooking(
  args: CreateBookingArgs,
): Promise<{ bookingId: string; bookingReference: string }> {
  if (args.passengers.length < 1 || args.passengers.length > 10) {
    throw new BookingError("INVALID_INPUT", "1-10 passengers per booking");
  }

  // Idempotency replay: if a key has already been used, return that booking.
  if (args.idempotencyKey) {
    const prior = await prisma.booking.findUnique({
      where: { idempotencyKey: args.idempotencyKey },
    });
    if (prior) {
      return {
        bookingId: prior.id,
        bookingReference: prior.bookingReference,
      };
    }
  }

  return prisma.$transaction(async (tx) => {
    const leg = await tx.leg.findUnique({
      where: { id: args.legId },
    });
    if (!leg) throw new BookingError("LEG_NOT_FOUND", "Departure not found");
    if (leg.status !== "OPEN") {
      throw new BookingError("LEG_CLOSED", "Departure is closed for booking");
    }
    if (leg.departureDate.getTime() <= Date.now()) {
      throw new BookingError("LEG_PAST", "Departure has already left");
    }
    if (leg.availableSeats < args.passengers.length) {
      throw new BookingError("SOLD_OUT", "Not enough seats available");
    }

    // Atomic decrement guarded by row-level availableSeats >= quantity.
    const reservation = await tx.leg.updateMany({
      where: {
        id: leg.id,
        status: "OPEN",
        availableSeats: { gte: args.passengers.length },
      },
      data: {
        availableSeats: { decrement: args.passengers.length },
      },
    });
    if (reservation.count === 0) {
      throw new BookingError("SOLD_OUT", "Just sold out — try another time");
    }

    const price = computeBookingPrice({
      unitPrice: leg.basePrice,
      quantity: args.passengers.length,
    });

    let bookingReference: string;
    let booking;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        bookingReference = newBookingReference();
        booking = await tx.booking.create({
          data: {
            bookingReference,
            legId: leg.id,
            customerName: args.customer.name,
            customerEmail: args.customer.email.toLowerCase(),
            customerPhone: args.customer.phone,
            customerNationality: args.customer.nationality ?? null,
            totalAmount: price.totalAmount,
            commissionAmount: price.commissionAmount,
            operatorAmount: price.operatorAmount,
            status: "PENDING_PAYMENT",
            refundDeadline: computeRefundDeadline(leg.departureDate),
            idempotencyKey: args.idempotencyKey ?? null,
            notes: args.notes ?? null,
            payment: {
              create: {
                amount: price.totalAmount,
                method: "pending",
                status: "PENDING",
                gatewayProvider: "xendit",
              },
            },
          },
        });
        break;
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === "P2002" &&
          attempt < 4
        ) {
          // Rare reference collision — regenerate.
          continue;
        }
        throw err;
      }
    }
    if (!booking) {
      throw new BookingError(
        "INVALID_INPUT",
        "Failed to mint booking reference",
      );
    }

    // Store passenger names on the Booking via a follow-up: tickets are not
    // issued yet, but we want the names persisted for the manifest preview
    // and email. Store them on `notes` as JSON for now.
    await tx.booking.update({
      where: { id: booking.id },
      data: {
        notes: JSON.stringify({
          ...(args.notes ? { customerNotes: args.notes } : {}),
          passengers: args.passengers,
        }),
      },
    });

    // Flip leg to FULL atomically only when WE consumed the last seat. The
    // updateMany guard ensures we never race another booking that just
    // freed seats — if availableSeats moved away from 0 between the
    // reservation and this check, no rows match and we don't downgrade.
    await tx.leg.updateMany({
      where: { id: leg.id, availableSeats: 0, status: "OPEN" },
      data: { status: "FULL" },
    });

    await tx.auditLog.create({
      data: {
        entityType: "booking",
        entityId: booking.id,
        action: "created",
        userRole: "customer",
        newState: {
          bookingReference: booking.bookingReference,
          legId: booking.legId,
          quantity: args.passengers.length,
          totalAmount: price.totalAmount.toString(),
        },
      },
    });

    return {
      bookingId: booking.id,
      bookingReference: booking.bookingReference,
    };
  });
}

/**
 * After reservation succeeds, kick off the Xendit invoice. Returns the
 * invoice URL the customer should be redirected to. In demo mode (no
 * XENDIT_SECRET_KEY), returns null so the UI surfaces a "mock pay" button.
 */
export async function startPaymentForBooking(
  bookingId: string,
): Promise<{ invoiceUrl: string | null; mock: boolean }> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { payment: true },
  });
  if (!booking) throw new BookingError("LEG_NOT_FOUND", "Booking not found");
  if (booking.status !== "PENDING_PAYMENT") {
    return { invoiceUrl: null, mock: false };
  }

  if (!isXenditConfigured()) {
    return { invoiceUrl: null, mock: true };
  }

  const lookupUrl = `${env.APP_BASE_URL}/b/${booking.bookingReference}`;
  try {
    const invoice = await createInvoice({
      externalId: booking.bookingReference,
      amount: Math.round(Number(booking.totalAmount)),
      payerEmail: booking.customerEmail,
      description: `Gilijet booking ${booking.bookingReference}`,
      successRedirectUrl: lookupUrl,
      failureRedirectUrl: lookupUrl,
      invoiceDuration: env.BOOKING_HOLD_MINUTES * 60,
    });
    await prisma.booking.update({
      where: { id: booking.id },
      data: { paymentGatewayRef: invoice.id },
    });
    await prisma.payment.update({
      where: { bookingId: booking.id },
      data: { gatewayReference: invoice.id, method: "xendit_invoice" },
    });
    await audit({
      entityType: "booking",
      entityId: booking.id,
      action: "invoice_created",
      userRole: "system",
      newState: { gatewayReference: invoice.id, invoiceUrl: invoice.invoiceUrl },
    });
    return { invoiceUrl: invoice.invoiceUrl, mock: false };
  } catch (err) {
    if (err instanceof XenditNotConfiguredError) {
      return { invoiceUrl: null, mock: true };
    }
    throw err;
  }
}

/** Release the seats held by a booking. Idempotent. */
export async function releaseBookingSeats(
  bookingId: string,
  reason:
    | "expired"
    | "cancelled_by_customer"
    | "cancelled_by_operator"
    | "payment_failed",
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({
      where: { id: bookingId },
      include: { tickets: true },
    });
    if (!booking) return;

    // Count quantity from tickets if issued, else from stored passengers list.
    let quantity = booking.tickets.length;
    if (quantity === 0 && booking.notes) {
      try {
        const parsed = JSON.parse(booking.notes) as { passengers?: unknown[] };
        if (Array.isArray(parsed.passengers))
          quantity = parsed.passengers.length;
      } catch {
        // Notes might be free-text — ignore.
      }
    }
    if (quantity <= 0) return;

    await tx.leg.update({
      where: { id: booking.legId },
      data: {
        availableSeats: { increment: quantity },
        // If the leg was marked FULL, reopen it.
        status: "OPEN",
      },
    });

    await tx.auditLog.create({
      data: {
        entityType: "booking",
        entityId: booking.id,
        action: `seats_released_${reason}`,
        userRole: "system",
        newState: { quantity },
      },
    });
  });
}
