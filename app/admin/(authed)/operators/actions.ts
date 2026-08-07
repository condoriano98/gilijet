"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";

const LIST = "/admin/operators";

function fail(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

/**
 * Erase an operator and everything hanging off it.
 *
 * Every foreign key into Operator is `onDelete: Restrict`, so a plain delete
 * fails the moment the operator owns a single boat. Removing it for real means
 * walking the tree bottom-up by hand, and that tree reaches Payment, Refund and
 * Ticket — the record of money that actually moved.
 *
 * So the reach is the reason for the guard. If any of those three exist the
 * action refuses and sends the admin to Suspend, which is reversible and hides
 * the operator just as well. Everything below that line — boats, schedules,
 * departures, staff, and bookings that never got as far as a payment — carries
 * no money and is safe to drop.
 */
export async function deleteOperatorAction(formData: FormData) {
  const session = await requireSuperAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) redirect(LIST);
  const back = `${LIST}/${id}`;

  const operator = await prisma.operator.findFirst({
    where: { id, deletedAt: null },
  });
  if (!operator) redirect(LIST);

  if (String(formData.get("confirmation") ?? "").trim() !== operator.companyName) {
    fail(back, "Type the company name exactly as shown to confirm deletion.");
  }

  // Collect the subtree as id lists rather than nested relation filters. The
  // delete order below depends on knowing the leg and schedule ids anyway —
  // RescheduleRequest and Review reference those directly, not just via their
  // booking — and reusing one list keeps every step matched to the same rows.
  const boatIds = (
    await prisma.boat.findMany({ where: { operatorId: id }, select: { id: true } })
  ).map((b) => b.id);

  const scheduleIds = boatIds.length
    ? (
        await prisma.schedule.findMany({
          where: { boatId: { in: boatIds } },
          select: { id: true },
        })
      ).map((s) => s.id)
    : [];

  // Leg carries a denormalised operatorId; match on both that and the schedule
  // so a row that disagrees with its parent still gets swept up rather than
  // blocking the delete with a foreign key error halfway through.
  const legIds = (
    await prisma.leg.findMany({
      where: {
        OR: [
          { operatorId: id },
          ...(scheduleIds.length ? [{ scheduleId: { in: scheduleIds } }] : []),
        ],
      },
      select: { id: true },
    })
  ).map((l) => l.id);

  const bookingIds = (
    await prisma.booking.findMany({
      where: {
        OR: [
          { operatorId: id },
          ...(legIds.length ? [{ legId: { in: legIds } }] : []),
        ],
      },
      select: { id: true },
    })
  ).map((b) => b.id);

  const [payments, refunds, tickets] = await Promise.all([
    prisma.payment.count({ where: { bookingId: { in: bookingIds } } }),
    prisma.refund.count({ where: { bookingId: { in: bookingIds } } }),
    prisma.ticket.count({ where: { bookingId: { in: bookingIds } } }),
  ]);

  const blockers = [
    payments ? `${payments} payment${payments === 1 ? "" : "s"}` : null,
    refunds ? `${refunds} refund${refunds === 1 ? "" : "s"}` : null,
    tickets ? `${tickets} issued ticket${tickets === 1 ? "" : "s"}` : null,
  ].filter(Boolean);

  if (blockers.length > 0) {
    fail(
      back,
      `${operator.companyName} has ${blockers.join(" and ")} on record. That is the audit trail for money already taken, so this operator cannot be erased — suspend it instead.`,
    );
  }

  const now = new Date();
  const live = await prisma.booking.count({
    where: {
      id: { in: bookingIds },
      status: { in: ["CONFIRMED", "PENDING_PAYMENT"] },
      leg: { departureDate: { gte: now } },
    },
  });
  if (live > 0) {
    fail(
      back,
      `${live} upcoming booking${live === 1 ? " is" : "s are"} still live — cancel those departures first, which refunds the customers.`,
    );
  }

  const deleted = await prisma.$transaction(
    async (tx) => {
      const byLeg = { legId: { in: legIds } };
      const byBooking = { bookingId: { in: bookingIds } };

      await tx.seatHold.deleteMany({ where: byLeg });
      await tx.weatherSnapshot.deleteMany({ where: byLeg });

      await tx.promotionRedemption.deleteMany({ where: byBooking });
      await tx.bookingAddon.deleteMany({ where: byBooking });
      // A reschedule request points at two legs as well as its booking, so one
      // that moved a customer onto a departure here blocks the leg delete even
      // when the booking itself belongs to another operator.
      await tx.rescheduleRequest.deleteMany({
        where: {
          OR: [
            byBooking,
            { originalLegId: { in: legIds } },
            { requestedLegId: { in: legIds } },
          ],
        },
      });
      // Same shape one level up: Review references the schedule directly.
      await tx.review.deleteMany({
        where: { OR: [byBooking, { scheduleId: { in: scheduleIds } }] },
      });

      const bookings = await tx.booking.deleteMany({
        where: { id: { in: bookingIds } },
      });
      const legs = await tx.leg.deleteMany({ where: { id: { in: legIds } } });

      await tx.transitStop.deleteMany({ where: { scheduleId: { in: scheduleIds } } });
      const schedules = await tx.schedule.deleteMany({
        where: { id: { in: scheduleIds } },
      });

      await tx.boatFacilitiesOnBoat.deleteMany({ where: { boatId: { in: boatIds } } });
      await tx.boatPosition.deleteMany({ where: { boatId: { in: boatIds } } });
      const boats = await tx.boat.deleteMany({ where: { id: { in: boatIds } } });

      // Cash drawer sessions hang off both the operator and its staff, so they
      // have to go before either.
      await tx.cashDrawerSession.deleteMany({ where: { operatorId: id } });
      const staff = await tx.operatorStaff.deleteMany({ where: { operatorId: id } });
      await tx.travelAgent.deleteMany({ where: { operatorId: id } });
      await tx.operatorDocument.deleteMany({ where: { operatorId: id } });
      await tx.operatorNotification.deleteMany({ where: { operatorId: id } });
      await tx.operatorServicesOnOperator.deleteMany({ where: { operatorId: id } });

      await tx.operator.delete({ where: { id } });

      // No foreign key backs this array, so the id survives the delete and
      // would keep silently narrowing a promotion to an operator that is gone.
      const targeted = await tx.promotion.findMany({
        where: { appliesToOperatorIds: { has: id } },
        select: { id: true, appliesToOperatorIds: true },
      });
      for (const promo of targeted) {
        await tx.promotion.update({
          where: { id: promo.id },
          data: {
            appliesToOperatorIds: promo.appliesToOperatorIds.filter((x) => x !== id),
          },
        });
      }

      return {
        bookings: bookings.count,
        legs: legs.count,
        schedules: schedules.count,
        boats: boats.count,
        staff: staff.count,
        promotionsRetargeted: targeted.length,
      };
    },
    { timeout: 30_000 },
  );

  await audit({
    entityType: "OPERATOR",
    entityId: id,
    action: "deleted_by_admin",
    userId: session.sub,
    userRole: "ADMIN",
    // The row no longer exists, so this snapshot is the only surviving record
    // of who was removed. AuditLog has no foreign key to Operator, so earlier
    // entries for this id stay readable alongside it.
    previousState: {
      email: operator.email,
      companyName: operator.companyName,
      contactPerson: operator.contactPerson,
      phoneNumber: operator.phoneNumber,
      status: operator.status,
      createdAt: operator.createdAt.toISOString(),
    },
    newState: { deleted },
  });

  revalidatePath(LIST);
  redirect(`${LIST}?deleted=${encodeURIComponent(operator.companyName)}`);
}
