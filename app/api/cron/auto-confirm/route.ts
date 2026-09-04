import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { buildQrPayload } from "@/lib/qr";
import { notifyBoardingPassIssued } from "@/lib/booking-notifications";
import {
  issueTicketsForBooking,
  SYSTEM_ACTOR_ID,
  type IssuedTicket,
} from "@/lib/ticket-issuer";

/**
 * Auto-confirm sweep: turn paid bookings into boarding passes without waiting
 * for the admin's phone call, but only where our own data says the departure is
 * healthy.
 *
 * This does not replace the manual gate in /admin/confirmations — it drains the
 * easy cases so that queue holds only what genuinely needs a human. Anything
 * this refuses is left untouched in AWAITING_CONFIRMATION. It never cancels and
 * never refunds; that stays a human decision.
 *
 * Deliberately a cron route rather than a webhook branch: the payment path must
 * never mint a ticket (see CLAUDE.md), and a sweep retries naturally where a
 * webhook gets one shot.
 */

// A sweep renders a PDF and makes two network sends per booking, so it can
// outlive the 5-minute tick. One Node process per container, so a module-level
// latch is enough to stop ticks piling up on each other.
let sweeping = false;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!env.CRON_SECRET || authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  if (!env.AUTO_CONFIRM_ENABLED) {
    return NextResponse.json({
      ok: true,
      disabled: true,
      issued: 0,
      repaired: 0,
      failed: 0,
      total: 0,
    });
  }

  if (sweeping) {
    return NextResponse.json({
      ok: true,
      busy: true,
      issued: 0,
      repaired: 0,
      failed: 0,
      total: 0,
    });
  }
  sweeping = true;

  try {
    const now = new Date();
    let issued = 0;
    let repaired = 0;
    let failed = 0;

    const candidates = await prisma.booking.findMany({
      where: {
        status: "AWAITING_CONFIRMATION",
        payment: { status: "SUCCESSFUL", paidAt: { not: null } },
        // An open refund means a human is already mid-decision on this booking.
        refund: null,
        leg: {
          // FULL is the normal case for a boat this booking filled, not a fault:
          // seats are decremented at reservation time. Only CANCELLED and
          // SAILED disqualify.
          status: { in: ["OPEN", "FULL"] },
          departureDate: { gt: now },
          schedule: {
            status: "ACTIVE",
            deletedAt: null,
            boat: { status: "ACTIVE", deletedAt: null },
          },
        },
      },
      select: { id: true, bookingReference: true },
      orderBy: [{ leg: { departureDate: "asc" } }, { createdAt: "asc" }],
      take: 25,
    });

    // Sequential on purpose: each iteration renders a react-pdf document, which
    // is CPU-bound, and fanning 25 of those out at once would stall the box.
    for (const booking of candidates) {
      try {
        const result = await issueTicketsForBooking({
          bookingId: booking.id,
          actor: { role: "SYSTEM", id: SYSTEM_ACTOR_ID },
          note: "Auto-confirmed: departure healthy at sweep time",
        });
        // Lost the race to an admin click or an overlapping tick — whoever won
        // sends the pass, so this one must not send a second copy.
        if (result.alreadyIssued) continue;

        await notifyBoardingPassIssued(booking.id, result.tickets);
        await prisma.booking.update({
          where: { id: booking.id },
          data: { boardingPassSentAt: new Date() },
        });
        issued++;
      } catch (err) {
        // Every refusal lands here — unhealthy leg, concurrent decision, no
        // passenger list. The booking stays in /admin/confirmations for a human.
        console.error(`[auto-confirm] skipped ${booking.bookingReference}:`, err);
        failed++;
      }
    }

    repaired = await repairUnsentPasses(now);

    console.log(
      `[auto-confirm] issued=${issued} repaired=${repaired} failed=${failed} total=${candidates.length}`,
    );
    return NextResponse.json({
      ok: true,
      issued,
      repaired,
      failed,
      total: candidates.length,
    });
  } finally {
    sweeping = false;
  }
}

/**
 * Re-send for bookings this sweep confirmed but never delivered.
 *
 * issueTicketsForBooking commits before the send, so a crash in between leaves a
 * CONFIRMED booking with valid tickets that has fallen out of both the sweep
 * query and the admin queue. Nothing else would ever find it.
 *
 * The availabilityDecidedById filter is load-bearing, not a nicety. This repo
 * has no migrations directory — `prisma db push` adds boardingPassSentAt as NULL
 * for every historical CONFIRMED booking. Scoping to rows the sweep itself
 * decided is what stops the first tick mailing the entire back catalogue.
 */
async function repairUnsentPasses(now: Date): Promise<number> {
  const stranded = await prisma.booking.findMany({
    where: {
      status: "CONFIRMED",
      boardingPassSentAt: null,
      availabilityDecidedById: SYSTEM_ACTOR_ID,
      availabilityDecidedAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
      tickets: { some: {} },
      leg: { departureDate: { gt: now }, status: { in: ["OPEN", "FULL"] } },
    },
    select: {
      id: true,
      bookingReference: true,
      leg: { select: { departureDate: true } },
      tickets: { select: { ticketCode: true, passengerName: true } },
    },
    take: 10,
  });

  let repaired = 0;
  for (const booking of stranded) {
    try {
      const tickets: IssuedTicket[] = booking.tickets.map((t) => ({
        ticketCode: t.ticketCode,
        passengerName: t.passengerName,
        qrPayload: buildQrPayload(t.ticketCode, booking.leg.departureDate),
      }));
      await notifyBoardingPassIssued(booking.id, tickets);
      await prisma.booking.update({
        where: { id: booking.id },
        data: { boardingPassSentAt: new Date() },
      });
      repaired++;
    } catch (err) {
      console.error(`[auto-confirm] repair failed ${booking.bookingReference}:`, err);
    }
  }
  return repaired;
}

export const dynamic = "force-dynamic";
