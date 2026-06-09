import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { env } from "./env";
import { audit } from "./audit";
import {
  computeBookingPriceWithTypes,
  type PassengerType,
} from "./pricing";
import { computeRefundDeadline, snapshotCurrentPolicy } from "./refunds";
import { newBookingReference } from "./references";
import { validatePromoCode, applyPromoCode } from "./promotions";
import { XenditNotConfiguredError } from "./xendit";
import { MayarNotConfiguredError } from "./mayar";
import { createPayment, isAnyPSPConfigured } from "./psp";

export class BookingError extends Error {
  constructor(
    public code:
      | "LEG_NOT_FOUND"
      | "LEG_CLOSED"
      | "LEG_PAST"
      | "SOLD_OUT"
      | "INVALID_INPUT"
      | "PROMO_INVALID",
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
  type?: PassengerType;
};

export type CreateBookingArgs = {
  legId: string;
  customer: BookingCustomer;
  passengers: BookingPassenger[];
  idempotencyKey?: string | null;
  notes?: string | null;
  customerId?: string | null;
  promoCode?: string | null;
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

  // Default passengers without explicit type to ADULT.
  const passengerTypes: PassengerType[] = args.passengers.map(
    (p) => p.type ?? "ADULT",
  );
  const seatCount = passengerTypes.filter((t) => t !== "INFANT").length;
  if (seatCount < 1) {
    throw new BookingError(
      "INVALID_INPUT",
      "At least one non-infant passenger required",
    );
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
    if (leg.availableSeats < seatCount) {
      throw new BookingError("SOLD_OUT", "Not enough seats available");
    }

    // Atomic decrement guarded by row-level availableSeats >= seatCount.
    const reservation = await tx.leg.updateMany({
      where: {
        id: leg.id,
        status: "OPEN",
        availableSeats: { gte: seatCount },
      },
      data: {
        availableSeats: { decrement: seatCount },
      },
    });
    if (reservation.count === 0) {
      throw new BookingError("SOLD_OUT", "Just sold out — try another time");
    }

    // Compute base total (pre-promo) to validate promo against
    const preDiscount = computeBookingPriceWithTypes({
      unitPrice: leg.basePrice,
      passengerTypes,
    });

    // Apply promo if provided
    let promotionId: string | null = null;
    let discountAmount = 0;
    if (args.promoCode && args.promoCode.trim()) {
      const validation = await validatePromoCode(
        args.promoCode,
        Number(preDiscount.totalAmount),
      );
      if (!validation.valid) {
        throw new BookingError("PROMO_INVALID", validation.error);
      }
      promotionId = validation.promotion.id;
      discountAmount = validation.discountAmount;
      await applyPromoCode(promotionId, tx);
    }

    const price = computeBookingPriceWithTypes({
      unitPrice: leg.basePrice,
      passengerTypes,
      discountAmount,
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
            operatorId: leg.operatorId,
            customerId: args.customerId ?? null,
            customerName: args.customer.name,
            customerEmail: args.customer.email.toLowerCase(),
            customerPhone: args.customer.phone,
            customerNationality: args.customer.nationality ?? null,
            totalAmount: price.totalAmount,
            commissionAmount: price.commissionAmount,
            operatorAmount: price.operatorAmount,
            promotionId,
            discountAmount: new Prisma.Decimal(discountAmount),
            status: "PENDING_PAYMENT",
            refundDeadline: computeRefundDeadline(leg.departureDate),
            refundPolicySnapshot: snapshotCurrentPolicy({
              departure: leg.departureDate,
              deadline: computeRefundDeadline(leg.departureDate),
            }),
            idempotencyKey: args.idempotencyKey ?? null,
            notes: args.notes ?? null,
            payment: {
              create: {
                amount: price.totalAmount,
                method: "BANK_TRANSFER",
                status: "PENDING",
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
        entityType: "BOOKING",
        entityId: booking.id,
        action: "created",
        userRole: "CUSTOMER",
        newState: {
          bookingReference: booking.bookingReference,
          legId: booking.legId,
          quantity: args.passengers.length,
          seatCount,
          adultCount: price.adultCount,
          childCount: price.childCount,
          infantCount: price.infantCount,
          totalAmount: price.totalAmount.toString(),
          discountAmount: discountAmount.toString(),
          promotionId,
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

  if (!isAnyPSPConfigured()) {
    return { invoiceUrl: null, mock: true };
  }

  const lookupUrl = `${env.APP_BASE_URL}/b/${booking.bookingReference}`;
  try {
    const result = await createPayment({
      bookingReference: booking.bookingReference,
      amount: Math.round(Number(booking.totalAmount)),
      payerEmail: booking.customerEmail,
      payerName: booking.customerName,
      payerPhone: booking.customerPhone,
      description: `Gilijet booking ${booking.bookingReference}`,
      successUrl: lookupUrl,
      failureUrl: lookupUrl,
      durationSeconds: (env.BOOKING_HOLD_MINUTES ?? 30) * 60,
    });
    await prisma.booking.update({
      where: { id: booking.id },
      data: { paymentGatewayRef: result.gatewayReference },
    });
    await prisma.payment.update({
      where: { bookingId: booking.id },
      data: {
        gatewayReference: result.gatewayReference,
        method:
          result.provider === "MIDTRANS"
            ? "CREDIT_CARD"
            : result.provider === "MAYAR"
              ? "BANK_TRANSFER"
              : "BANK_TRANSFER",
        gatewayProvider: result.provider,
      },
    });
    await audit({
      entityType: "BOOKING",
      entityId: booking.id,
      action: "payment_initiated",
      userRole: "SYSTEM",
      newState: { provider: result.provider, gatewayReference: result.gatewayReference },
    });
    return { invoiceUrl: result.redirectUrl, mock: false };
  } catch (err) {
    if (err instanceof XenditNotConfiguredError) {
      return { invoiceUrl: null, mock: true };
    }
    if (err instanceof MayarNotConfiguredError) {
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

    // Count seats from tickets if issued (tickets only exist for non-infant
    // passengers), else from stored passengers list filtering out infants.
    let quantity = booking.tickets.length;
    if (quantity === 0 && booking.notes) {
      try {
        const parsed = JSON.parse(booking.notes) as {
          passengers?: Array<{ type?: string }>;
        };
        if (Array.isArray(parsed.passengers)) {
          quantity = parsed.passengers.filter(
            (p) => p.type !== "INFANT",
          ).length;
        }
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
        entityType: "BOOKING",
        entityId: booking.id,
        action: `seats_released_${reason}`,
        userRole: "SYSTEM",
        newState: { quantity },
      },
    });
  });
}
