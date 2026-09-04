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

/** Sentinel written to Booking.availabilityDecidedById by the auto-confirm sweep. */
export const SYSTEM_ACTOR_ID = "system:auto-confirm";

/**
 * Who is issuing. A union rather than an `automated` flag so that a SYSTEM row
 * can never carry a human's id, and an ADMIN row can never be missing one —
 * the audit trail is the only record of who promised the seat.
 */
export type IssueActor =
  | { role: "ADMIN"; id: string }
  | { role: "SYSTEM"; id: typeof SYSTEM_ACTOR_ID };

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
 * Mint the tickets for a booking whose seat has been established — either by an
 * admin ringing the operator, or by the auto-confirm sweep finding the leg
 * healthy in our own data.
 *
 * Idempotent: re-running against an already-CONFIRMED booking returns the
 * existing tickets rather than minting a second set, so a double-clicked
 * approve button cannot double-issue. Concurrency beyond that is handled by the
 * two guarded writes below, not by this early return.
 */
export async function issueTicketsForBooking(args: {
  bookingId: string;
  actor: IssueActor;
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

    // A boarding pass for a cancelled or departed boat must not exist, whoever
    // asked for it — so this is enforced here rather than in the callers.
    //
    // The no-op write is deliberate: it takes the row lock while re-evaluating
    // the predicate against the latest committed row. Under READ COMMITTED a
    // plain re-read would still race cancelLeg, which can cancel the leg
    // between the caller's query and this transaction. Lock order matters —
    // cancelLeg takes leg then bookings, so this must stay ahead of the
    // booking write below or the two deadlock.
    const legStillHealthy = await tx.leg.updateMany({
      where: {
        id: booking.legId,
        status: { in: ["OPEN", "FULL"] },
        departureDate: { gt: new Date() },
      },
      data: { updatedAt: new Date() },
    });
    if (legStillHealthy.count !== 1) {
      throw new Error(
        `Cannot issue tickets for ${booking.bookingReference}: departure is cancelled, sailed or in the past`,
      );
    }

    // Conditional write, not a bare update: the findUnique above proves nothing
    // by the time we get here. Exactly one caller can move the booking out of
    // AWAITING_CONFIRMATION, so exactly one caller gets alreadyIssued:false and
    // therefore exactly one sends the pass. Without this, a sweep racing an
    // admin click mints two full sets of tickets.
    const moved = await tx.booking.updateMany({
      where: { id: booking.id, status: "AWAITING_CONFIRMATION" },
      data: {
        status: "CONFIRMED",
        availabilityDecidedAt: new Date(),
        availabilityDecidedById: args.actor.id,
        availabilityNote: args.note ?? null,
      },
    });
    if (moved.count !== 1) {
      throw new Error(
        `Booking ${booking.bookingReference} was decided concurrently`,
      );
    }

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
        userRole: args.actor.role,
        userId: args.actor.id,
        newState: {
          tickets: issued.map((t) => t.ticketCode),
          note: args.note ?? null,
          automated: args.actor.role === "SYSTEM",
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
 *
 * Takes a plain adminId rather than the IssueActor union on purpose: refusing a
 * booking owes the customer money, so it stays a human decision. The
 * auto-confirm sweep only ever issues — it leaves anything it cannot ticket in
 * the queue for someone to ring the operator about.
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
