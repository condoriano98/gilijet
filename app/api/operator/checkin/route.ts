import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getOperatorSession } from "@/lib/auth";
import { verifyQrPayload } from "@/lib/qr";
import { formatLocalDateTime, ymdInZone } from "@/lib/datetime";

const bodySchema = z.object({
  qrPayload: z.string().min(1),
  legId: z.string().min(1),
});

export type CheckinResult =
  | {
      ok: true;
      ticket: {
        ticketCode: string;
        passengerName: string;
        bookingReference: string;
      };
    }
  | {
      ok: false;
      reason:
        | "UNAUTHORIZED"
        | "INVALID_QR"
        | "TICKET_NOT_FOUND"
        | "WRONG_OPERATOR"
        | "WRONG_LEG"
        | "ALREADY_CHECKED_IN"
        | "REFUNDED"
        | "LEG_NOT_ACTIVE"
        | "INVALID_INPUT";
      message: string;
      details?: Record<string, unknown>;
    };

export async function POST(req: NextRequest): Promise<NextResponse<CheckinResult>> {
  const session = await getOperatorSession();
  if (!session) {
    return NextResponse.json(
      { ok: false, reason: "UNAUTHORIZED", message: "Sign in required." },
      { status: 401 },
    );
  }

  let parsed;
  try {
    const json = await req.json();
    parsed = bodySchema.safeParse(json);
  } catch {
    return NextResponse.json(
      { ok: false, reason: "INVALID_INPUT", message: "Bad JSON body." },
      { status: 400 },
    );
  }
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, reason: "INVALID_INPUT", message: "qrPayload + legId required." },
      { status: 400 },
    );
  }

  const verified = verifyQrPayload(parsed.data.qrPayload);
  if (!verified.ok) {
    return NextResponse.json(
      {
        ok: false,
        reason: "INVALID_QR",
        message: "QR code is not a valid Gilibali ticket.",
      },
      { status: 400 },
    );
  }

  // One atomic transaction to flip ISSUED → CHECKED_IN, with row-level
  // safeguards: filter on status=ISSUED so a race between two scanners
  // can't double-count.
  try {
    const result = await prisma.$transaction(async (tx) => {
      const ticket = await tx.ticket.findUnique({
        where: { ticketCode: verified.ticketCode },
        include: {
          booking: {
            include: {
              leg: {
                include: { schedule: { include: { boat: true } } },
              },
            },
          },
        },
      });
      if (!ticket) {
        return {
          ok: false as const,
          reason: "TICKET_NOT_FOUND" as const,
          message: "Ticket not found in the system.",
        };
      }
      const leg = ticket.booking.leg;
      if (leg.operatorId !== session.sub) {
        return {
          ok: false as const,
          reason: "WRONG_OPERATOR" as const,
          message: "This ticket belongs to a different operator.",
        };
      }
      if (leg.id !== parsed.data.legId) {
        return {
          ok: false as const,
          reason: "WRONG_LEG" as const,
          message: `Ticket is for the ${formatLocalDateTime(leg.departureDate)} departure (${leg.schedule.originPort} → ${leg.schedule.destinationPort}).`,
          details: {
            expectedLegId: leg.id,
            expectedDeparture: leg.departureDate.toISOString(),
            route: `${leg.schedule.originPort} → ${leg.schedule.destinationPort}`,
          },
        };
      }
      // QR is HMAC-bound to the sailing date. A QR built for a different
      // departure date cannot be replayed against this leg even if the
      // ticketCode were ever reused.
      if (verified.departureYmd !== ymdInZone(leg.departureDate)) {
        return {
          ok: false as const,
          reason: "INVALID_QR" as const,
          message: "QR code is not valid for this sailing date.",
        };
      }
      if (leg.status === "CANCELLED" || leg.status === "SAILED") {
        return {
          ok: false as const,
          reason: "LEG_NOT_ACTIVE" as const,
          message: `Departure is ${leg.status.toLowerCase()}.`,
        };
      }
      if (ticket.status === "REFUNDED") {
        return {
          ok: false as const,
          reason: "REFUNDED" as const,
          message: "Ticket was refunded.",
        };
      }
      if (ticket.status === "CHECKED_IN") {
        return {
          ok: false as const,
          reason: "ALREADY_CHECKED_IN" as const,
          message: ticket.checkedInAt
            ? `Already checked in at ${formatLocalDateTime(ticket.checkedInAt)}.`
            : "Already checked in.",
        };
      }
      if (ticket.status !== "ISSUED") {
        return {
          ok: false as const,
          reason: "LEG_NOT_ACTIVE" as const,
          message: `Ticket is in state ${ticket.status}.`,
        };
      }

      // Atomic flip: updateMany on (id, status='ISSUED') so concurrent
      // scanners see exactly one success.
      const update = await tx.ticket.updateMany({
        where: { id: ticket.id, status: "ISSUED" },
        data: {
          status: "CHECKED_IN",
          checkedInAt: new Date(),
          checkedInBy: session.sub,
        },
      });
      if (update.count === 0) {
        return {
          ok: false as const,
          reason: "ALREADY_CHECKED_IN" as const,
          message: "Already checked in (race).",
        };
      }
      await tx.auditLog.create({
        data: {
        entityType: "TICKET",
        entityId: ticket.id,
        action: "checked_in_qr",
        userId: session.sub,
        userRole: "OPERATOR",
          newState: { status: "CHECKED_IN", method: "qr" },
        },
      });
      return {
        ok: true as const,
        ticket: {
          ticketCode: ticket.ticketCode,
          passengerName: ticket.passengerName,
          bookingReference: ticket.booking.bookingReference,
        },
      };
    });

    return NextResponse.json(result, { status: result.ok ? 200 : 409 });
  } catch (err) {
    console.error("[checkin] transaction failed:", err);
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      return NextResponse.json(
        {
          ok: false,
          reason: "INVALID_INPUT",
          message: "Database constraint hit; check ticket state.",
        },
        { status: 500 },
      );
    }
    return NextResponse.json(
      {
        ok: false,
        reason: "INVALID_INPUT",
        message: "Internal server error.",
      },
      { status: 500 },
    );
  }
}
