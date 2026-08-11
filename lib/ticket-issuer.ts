import { Prisma, PaymentMethod } from "@prisma/client";
import { prisma } from "./db";
import { releaseBookingSeats } from "./booking-engine";
import { ymdInZone } from "./datetime";
import { buildQrPayload, signTicketCode } from "./qr";
import { newTicketCode } from "./references";

/**
 * Payment and ticketing are deliberately two separate steps.
 *
 * Money settling only proves the customer paid — it does not prove the boat is
 * running or has room. The operators on this platform take bookings by phone
 * and do not use the dashboard, so the only way to establish that is for an
 * admin to ring them. A booking therefore parks in AWAITING_CONFIRMATION until
 * someone has done that, and the boarding pass is minted on the far side of it.
 */
export type IssuedTicket = {
  ticketCode: string;
  passengerName: string;
  qrPayload: string;
};

export type IssueResult = {
  bookingReference: string;
  tickets: IssuedTicket[];
  alreadyIssued: boolean;
};

export type PaymentRecordedResult = {
  bookingReference: string;
  alreadyRecorded: boolean;
};

/**
 * Idempotently record that a booking is paid, without ticketing it.
 *
 * Safe to call from a webhook that may re-deliver: a booking already past
 * PENDING_PAYMENT returns `alreadyRecorded` and is left untouched, so a late
 * redelivery cannot drag a confirmed or cancelled booking backwards.
 */
export async function recordPaymentAwaitingConfirmation(args: {
  bookingId: string;
  paidAt?: Date;
  gatewayReference?: string | null;
  method?: PaymentMethod | null;
  gatewayFee?: number | null;
}): Promise<PaymentRecordedResult> {
  return prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({
      where: { id: args.bookingId },
      include: { payment: true },
    });
    if (!booking) throw new Error(`Booking ${args.bookingId} not found`);

    if (booking.status !== "PENDING_PAYMENT") {
      return {
        bookingReference: booking.bookingReference,
        alreadyRecorded: true,
      };
    }

    if (parsePassengers(booking.notes).length === 0) {
      throw new Error(
        `Booking ${booking.bookingReference} has no passenger list to ticket`,
      );
    }

    if (booking.payment) {
      await tx.payment.update({
        where: { bookingId: booking.id },
        data: {
          status: "SUCCESSFUL",
          paidAt: args.paidAt ?? new Date(),
          gatewayReference:
            args.gatewayReference ?? booking.payment.gatewayReference,
          method: args.method ?? booking.payment.method ?? ("BANK_TRANSFER" as PaymentMethod),
          gatewayFee:
            args.gatewayFee != null
              ? new Prisma.Decimal(args.gatewayFee)
              : booking.payment.gatewayFee,
        },
      });
    }

    await tx.booking.update({
      where: { id: booking.id },
      data: { status: "AWAITING_CONFIRMATION" },
    });

    await tx.auditLog.create({
      data: {
        entityType: "BOOKING",
        entityId: booking.id,
        action: "paid_awaiting_operator_confirmation",
        userRole: "SYSTEM",
        newState: { method: args.method ?? "unknown" },
      },
    });

    return {
      bookingReference: booking.bookingReference,
      alreadyRecorded: false,
    };
  });
}

/**
 * Mint the tickets for a booking an admin has confirmed with the operator.
 *
 * Idempotent: re-running against an already-CONFIRMED booking returns the
 * existing tickets rather than minting a second set, so a double-clicked
 * approve button cannot double-issue.
 */
export async function issueTicketsForBooking(args: {
  bookingId: string;
  adminId: string;
  note?: string | null;
}): Promise<IssueResult> {
  return prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({
      where: { id: args.bookingId },
      include: {
        tickets: true,
        leg: { select: { departureDate: true } },
      },
    });
    if (!booking) throw new Error(`Booking ${args.bookingId} not found`);
    const departureDate = booking.leg.departureDate;

    if (booking.status === "CONFIRMED" && booking.tickets.length > 0) {
      return {
        bookingReference: booking.bookingReference,
        alreadyIssued: true,
        tickets: booking.tickets.map((t) => ({
          ticketCode: t.ticketCode,
          passengerName: t.passengerName,
          qrPayload: buildQrPayload(t.ticketCode, departureDate),
        })),
      };
    }

    if (booking.status !== "AWAITING_CONFIRMATION") {
      throw new Error(
        `Cannot issue tickets for ${booking.bookingReference} (status=${booking.status})`,
      );
    }

    const passengers = parsePassengers(booking.notes);
    if (passengers.length === 0) {
      throw new Error(
        `Booking ${booking.bookingReference} has no passenger list to ticket`,
      );
    }

    await tx.booking.update({
      where: { id: booking.id },
      data: {
        status: "CONFIRMED",
        availabilityDecidedAt: new Date(),
        availabilityDecidedById: args.adminId,
        availabilityNote: args.note ?? null,
      },
    });

    const issued: IssuedTicket[] = [];
    const departureYmd = ymdInZone(departureDate);
    for (let i = 0; i < passengers.length; i++) {
      const passenger = passengers[i];
      const code = newTicketCode(booking.bookingReference, i + 1);
      const qrHash = signTicketCode(code, departureYmd);
      await tx.ticket.create({
        data: {
          bookingId: booking.id,
          ticketCode: code,
          passengerName: passenger.name,
          passengerIdNumber: passenger.idNumber ?? null,
          qrHash,
          status: "ISSUED",
        },
      });
      issued.push({
        ticketCode: code,
        passengerName: passenger.name,
        qrPayload: buildQrPayload(code, departureDate),
      });
    }

    await tx.auditLog.create({
      data: {
        entityType: "BOOKING",
        entityId: booking.id,
        action: "operator_confirmed_and_ticketed",
        userRole: "ADMIN",
        userId: args.adminId,
        newState: {
          tickets: issued.map((t) => t.ticketCode),
          note: args.note ?? null,
        },
      },
    });

    return {
      bookingReference: booking.bookingReference,
      alreadyIssued: false,
      tickets: issued,
    };
  });
}

export type RejectResult = {
  bookingReference: string;
  alreadyRejected: boolean;
  refundAmount: string;
};

/**
 * Record that the operator cannot take the booking: cancel it, hand the seats
 * back, and open a full-value Refund for the existing /admin/refunds queue to
 * process. The customer has already paid at this point, so the refund row is
 * the record that money is owed — it is created in the same transaction as the
 * cancellation so the two cannot diverge.
 *
 * Seats are released outside the transaction because releaseBookingSeats opens
 * its own; it reads the passenger list from notes when no tickets exist, which
 * is always the case here.
 */
export async function rejectBookingAvailability(args: {
  bookingId: string;
  adminId: string;
  note?: string | null;
}): Promise<RejectResult> {
  const result = await prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({
      where: { id: args.bookingId },
      include: { refund: true },
    });
    if (!booking) throw new Error(`Booking ${args.bookingId} not found`);

    if (booking.status === "CANCELLED_BY_OPERATOR") {
      return {
        bookingReference: booking.bookingReference,
        alreadyRejected: true,
        refundAmount: (booking.refund?.refundAmount ?? booking.totalAmount).toString(),
        released: false,
      };
    }

    if (booking.status !== "AWAITING_CONFIRMATION") {
      throw new Error(
        `Cannot reject ${booking.bookingReference} (status=${booking.status})`,
      );
    }

    await tx.booking.update({
      where: { id: booking.id },
      data: {
        status: "CANCELLED_BY_OPERATOR",
        availabilityDecidedAt: new Date(),
        availabilityDecidedById: args.adminId,
        availabilityNote: args.note ?? null,
      },
    });

    // The customer did nothing wrong, so the cancellation-tier maths in
    // lib/refunds.ts does not apply — this is always the full amount.
    if (!booking.refund) {
      await tx.refund.create({
        data: {
          bookingId: booking.id,
          originalAmount: booking.totalAmount,
          refundAmount: booking.totalAmount,
          reason: "OPERATOR_CANCELLATION",
          status: "PENDING",
          adminNote: args.note ?? null,
        },
      });
    }

    await tx.auditLog.create({
      data: {
        entityType: "BOOKING",
        entityId: booking.id,
        action: "operator_unavailable_cancelled",
        userRole: "ADMIN",
        userId: args.adminId,
        newState: {
          refundAmount: booking.totalAmount.toString(),
          note: args.note ?? null,
        },
      },
    });

    return {
      bookingReference: booking.bookingReference,
      alreadyRejected: false,
      refundAmount: booking.totalAmount.toString(),
      released: true,
    };
  });

  if (result.released) {
    await releaseBookingSeats(args.bookingId, "cancelled_by_operator");
  }

  return {
    bookingReference: result.bookingReference,
    alreadyRejected: result.alreadyRejected,
    refundAmount: result.refundAmount,
  };
}

function parsePassengers(
  notes: string | null,
): Array<{ name: string; idNumber?: string | null }> {
  if (!notes) return [];
  try {
    const parsed = JSON.parse(notes) as {
      passengers?: Array<{ name: string; idNumber?: string | null }>;
    };
    if (Array.isArray(parsed.passengers)) return parsed.passengers;
  } catch {
    // Free-text note — no passenger list embedded.
  }
  return [];
}
