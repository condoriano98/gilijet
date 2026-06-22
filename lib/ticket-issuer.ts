import { Prisma, PaymentMethod } from "@prisma/client";
import { prisma } from "./db";
import { ymdInZone } from "./datetime";
import { buildQrPayload, signTicketCode } from "./qr";
import { newTicketCode } from "./references";

/**
 * Idempotently confirm a paid booking: flip statuses, mint Tickets with
 * HMAC-signed QR codes, and return the rendered QR payloads so the caller
 * can hand them to the email job.
 *
 * Safe to call from a webhook that may re-deliver. If the booking is
 * already CONFIRMED, we just return the existing tickets.
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

export async function confirmPaymentAndIssueTickets(args: {
  bookingId: string;
  paidAt?: Date;
  gatewayReference?: string | null;
  method?: PaymentMethod | null;
  gatewayFee?: number | null;
}): Promise<IssueResult> {
  return prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({
      where: { id: args.bookingId },
      include: {
        tickets: true,
        payment: true,
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

    if (
      booking.status !== "PENDING_PAYMENT" &&
      booking.status !== "CONFIRMED"
    ) {
      throw new Error(
        `Cannot confirm booking ${booking.bookingReference} (status=${booking.status})`,
      );
    }

    const passengers = parsePassengers(booking.notes);
    if (passengers.length === 0) {
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
      data: { status: "CONFIRMED" },
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
        action: "confirmed_and_ticketed",
        userRole: "SYSTEM",
        newState: {
          tickets: issued.map((t) => t.ticketCode),
          method: args.method ?? "unknown",
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
