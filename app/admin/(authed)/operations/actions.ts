"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { requireSuperAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import {
  BOOKING_HORIZON_DAYS,
  cancelLeg,
  generateLegsForSchedule,
} from "@/lib/legs";

/**
 * Operations desk — the platform owner creating and running boat inventory on
 * behalf of operators, because the operators cannot work their own dashboard.
 *
 * These are the first admin writes to operator-owned inventory in the codebase.
 * Everywhere else, tenant scoping comes for free from the session: the operator
 * pages look a boat up with `operatorId: session.sub` and cannot reach another
 * tenant's rows. Here there is no session operator, so that safety net is gone
 * and the operator has to be supplied explicitly.
 *
 * The rule these actions follow is to *parameterise* the ownership check rather
 * than drop it — `assertBoatOwnedBy` is the same query the operator pages run,
 * with the target operator passed in instead of read from the session. It
 * matters because `Schedule` has no `operatorId` column: ownership is derived
 * solely through `boatId -> Boat.operatorId`. Attaching a schedule to the wrong
 * tenant's boat would silently move its bookings, revenue and payouts, and
 * nothing downstream would flag it.
 */

const OPS = "/admin/operations";

function fail(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

/**
 * Resolve a boat, refusing it unless it belongs to `operatorId`.
 *
 * This is the load-bearing check for every write here. Do not replace it with a
 * plain `findUnique` on the id.
 */
async function assertBoatOwnedBy(boatId: string, operatorId: string) {
  return prisma.boat.findFirst({
    where: { id: boatId, operatorId, deletedAt: null },
  });
}

/** Ownership of a schedule is only knowable through its boat. */
async function scheduleWithOwner(scheduleId: string) {
  return prisma.schedule.findFirst({
    where: { id: scheduleId, deletedAt: null },
    include: { boat: { select: { id: true, operatorId: true, capacity: true } } },
  });
}

// ---------- boats ----------

const boatSchema = z.object({
  operatorId: z.string().min(1, "Pick an operator"),
  name: z.string().min(2, "Name must be at least 2 characters").max(120),
  registrationNumber: z.string().min(2, "Registration number is required").max(40),
  capacity: z.coerce.number().int().min(1).max(500),
  description: z.string().max(1000).optional().or(z.literal("")),
});

export async function createBoat(formData: FormData) {
  const session = await requireSuperAdmin();
  const parsed = boatSchema.safeParse({
    operatorId: formData.get("operatorId"),
    name: formData.get("name"),
    registrationNumber: formData.get("registrationNumber"),
    capacity: formData.get("capacity"),
    description: formData.get("description"),
  });
  if (!parsed.success) fail(`${OPS}/boats/new`, parsed.error.issues[0].message);
  const d = parsed.data;

  const operator = await prisma.operator.findFirst({
    where: { id: d.operatorId, deletedAt: null },
    select: { id: true, companyName: true },
  });
  if (!operator) fail(`${OPS}/boats/new`, "Operator not found");

  let boatId: string;
  try {
    const boat = await prisma.boat.create({
      data: {
        operatorId: operator.id,
        name: d.name,
        registrationNumber: d.registrationNumber.trim(),
        capacity: d.capacity,
        description: d.description || null,
        photos: [],
        status: "ACTIVE",
      },
    });
    boatId = boat.id;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      fail(`${OPS}/boats/new`, "Registration number already in use");
    }
    throw err;
  }

  await audit({
    entityType: "BOAT",
    entityId: boatId,
    action: "created_by_admin",
    userId: session.sub,
    userRole: "ADMIN",
    newState: { operatorId: operator.id, operator: operator.companyName, name: d.name },
  });

  revalidatePath(`${OPS}/boats`);
  redirect(`${OPS}/boats?ok=1`);
}

export async function updateBoat(formData: FormData) {
  const session = await requireSuperAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) redirect(`${OPS}/boats`);

  const parsed = boatSchema.omit({ operatorId: true }).safeParse({
    name: formData.get("name"),
    registrationNumber: formData.get("registrationNumber"),
    capacity: formData.get("capacity"),
    description: formData.get("description"),
  });
  if (!parsed.success) fail(`${OPS}/boats/${id}`, parsed.error.issues[0].message);
  const d = parsed.data;

  const prev = await prisma.boat.findFirst({ where: { id, deletedAt: null } });
  if (!prev) fail(`${OPS}/boats`, "Boat not found");

  // The owning operator is never editable here. Moving a boat between operators
  // would drag its schedules, departures and historical bookings with it.
  try {
    await prisma.boat.update({
      where: { id },
      data: {
        name: d.name,
        registrationNumber: d.registrationNumber.trim(),
        capacity: d.capacity,
        description: d.description || null,
        status: formData.get("status") === "INACTIVE" ? "INACTIVE" : "ACTIVE",
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      fail(`${OPS}/boats/${id}`, "Registration number already in use");
    }
    throw err;
  }

  await audit({
    entityType: "BOAT",
    entityId: id,
    action: "updated_by_admin",
    userId: session.sub,
    userRole: "ADMIN",
    previousState: { name: prev.name, capacity: prev.capacity, status: prev.status },
    newState: { name: d.name, capacity: d.capacity },
  });

  revalidatePath(`${OPS}/boats`);
  redirect(`${OPS}/boats?ok=1`);
}

// ---------- schedules ----------

const daysCsv = z
  .string()
  .min(1, "Pick at least one day")
  .transform((v) => v.split(",").map((n) => Number(n)).filter(Number.isInteger))
  .refine((v) => v.length > 0, "Pick at least one day")
  .refine((v) => v.every((d) => d >= 1 && d <= 7), "Day values must be 1-7");

const scheduleSchema = z.object({
  operatorId: z.string().min(1, "Pick an operator"),
  boatId: z.string().min(1, "Pick a boat"),
  originPort: z.string().min(2).max(80),
  destinationPort: z.string().min(2).max(80),
  departureTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Departure time must be HH:MM"),
  durationMinutes: z.coerce.number().int().min(5).max(720),
  basePrice: z.coerce.number().int().min(1000).max(50_000_000),
  daysOfWeek: daysCsv,
});

function readScheduleForm(formData: FormData) {
  return scheduleSchema.safeParse({
    operatorId: formData.get("operatorId"),
    boatId: formData.get("boatId"),
    originPort: formData.get("originPort"),
    destinationPort: formData.get("destinationPort"),
    departureTime: formData.get("departureTime"),
    durationMinutes: formData.get("durationMinutes"),
    basePrice: formData.get("basePrice"),
    daysOfWeek: formData.get("daysOfWeek"),
  });
}

export async function createSchedule(formData: FormData) {
  const session = await requireSuperAdmin();
  const back = `${OPS}/schedules/new`;
  const parsed = readScheduleForm(formData);
  if (!parsed.success) fail(back, parsed.error.issues[0].message);
  const d = parsed.data;

  // The check that makes this safe: the boat must belong to the operator the
  // form named, not merely exist.
  const boat = await assertBoatOwnedBy(d.boatId, d.operatorId);
  if (!boat) fail(back, "That boat does not belong to the selected operator");

  if (d.originPort.trim() === d.destinationPort.trim()) {
    fail(back, "Origin and destination must differ");
  }

  const schedule = await prisma.schedule.create({
    data: {
      boatId: boat.id,
      originPort: d.originPort.trim(),
      destinationPort: d.destinationPort.trim(),
      departureTime: d.departureTime,
      durationMinutes: d.durationMinutes,
      basePrice: d.basePrice,
      daysOfWeek: d.daysOfWeek,
      status: "ACTIVE",
    },
  });

  await audit({
    entityType: "SCHEDULE",
    entityId: schedule.id,
    action: "created_by_admin",
    userId: session.sub,
    userRole: "ADMIN",
    newState: {
      operatorId: d.operatorId,
      route: `${schedule.originPort} → ${schedule.destinationPort}`,
      time: schedule.departureTime,
      days: schedule.daysOfWeek,
    },
  });

  // Without this the schedule exists but sells nothing until the nightly cron.
  await generateLegsForSchedule(schedule.id, BOOKING_HORIZON_DAYS);

  revalidatePath(`${OPS}/schedules`);
  redirect(`${OPS}/schedules/${schedule.id}?ok=1`);
}

export async function updateSchedule(formData: FormData) {
  const session = await requireSuperAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) redirect(`${OPS}/schedules`);
  const back = `${OPS}/schedules/${id}`;

  const parsed = readScheduleForm(formData);
  if (!parsed.success) fail(back, parsed.error.issues[0].message);
  const d = parsed.data;

  const existing = await scheduleWithOwner(id);
  if (!existing) fail(`${OPS}/schedules`, "Schedule not found");

  // Re-check on every save, including when the boat is being changed — the
  // replacement must belong to the same operator that already owns this
  // schedule, so a schedule can never hop tenants through an edit.
  if (existing.boat.operatorId !== d.operatorId) {
    fail(back, "A schedule cannot be moved to a different operator");
  }
  const boat = await assertBoatOwnedBy(d.boatId, d.operatorId);
  if (!boat) fail(back, "That boat does not belong to the selected operator");

  if (d.originPort.trim() === d.destinationPort.trim()) {
    fail(back, "Origin and destination must differ");
  }

  await prisma.schedule.update({
    where: { id },
    data: {
      boatId: boat.id,
      originPort: d.originPort.trim(),
      destinationPort: d.destinationPort.trim(),
      departureTime: d.departureTime,
      durationMinutes: d.durationMinutes,
      basePrice: d.basePrice,
      daysOfWeek: d.daysOfWeek,
    },
  });

  await audit({
    entityType: "SCHEDULE",
    entityId: id,
    action: "updated_by_admin",
    userId: session.sub,
    userRole: "ADMIN",
    previousState: {
      route: `${existing.originPort} → ${existing.destinationPort}`,
      time: existing.departureTime,
    },
    newState: {
      operatorId: d.operatorId,
      route: `${d.originPort} → ${d.destinationPort}`,
      time: d.departureTime,
    },
  });

  revalidatePath(back);
  redirect(`${back}?ok=1`);
}

export async function setScheduleStatus(formData: FormData) {
  const session = await requireSuperAdmin();
  const id = String(formData.get("id") ?? "");
  const next = formData.get("next") === "ACTIVE" ? "ACTIVE" : "INACTIVE";
  if (!id) redirect(`${OPS}/schedules`);

  const existing = await scheduleWithOwner(id);
  if (!existing) fail(`${OPS}/schedules`, "Schedule not found");

  await prisma.schedule.update({ where: { id }, data: { status: next } });

  await audit({
    entityType: "SCHEDULE",
    entityId: id,
    action: next === "ACTIVE" ? "activated_by_admin" : "deactivated_by_admin",
    userId: session.sub,
    userRole: "ADMIN",
    previousState: { status: existing.status },
    newState: { status: next, operatorId: existing.boat.operatorId },
  });

  revalidatePath(`${OPS}/schedules/${id}`);
  redirect(`${OPS}/schedules/${id}?ok=1`);
}

/**
 * Top up departures for one schedule now, rather than waiting for the nightly
 * cron. Idempotent — existing departures are skipped on the unique
 * (scheduleId, departureDate).
 */
export async function regenerateDepartures(formData: FormData) {
  const session = await requireSuperAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) redirect(`${OPS}/schedules`);

  const existing = await scheduleWithOwner(id);
  if (!existing) fail(`${OPS}/schedules`, "Schedule not found");
  if (existing.status !== "ACTIVE") {
    fail(`${OPS}/schedules/${id}`, "Activate the schedule before generating departures");
  }

  const created = await generateLegsForSchedule(id, BOOKING_HORIZON_DAYS);

  await audit({
    entityType: "SCHEDULE",
    entityId: id,
    action: "departures_generated_by_admin",
    userId: session.sub,
    userRole: "ADMIN",
    newState: { created, horizonDays: BOOKING_HORIZON_DAYS },
  });

  revalidatePath(`${OPS}/schedules/${id}`);
  redirect(`${OPS}/schedules/${id}?generated=${created}`);
}

// ---------- departures ----------

export async function cancelDeparture(formData: FormData) {
  const session = await requireSuperAdmin();
  const legId = String(formData.get("legId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!legId) redirect(OPS);
  const back = `${OPS}/departures/${legId}`;
  if (reason.length < 3) fail(back, "Give a cancellation reason");

  const leg = await prisma.leg.findUnique({
    where: { id: legId },
    select: { id: true, operatorId: true, status: true },
  });
  if (!leg) fail(OPS, "Departure not found");

  let result: { cancelledBookings: number; pendingRefunds: number };
  try {
    // cancelLeg enforces its own operator check; passing the leg's own operator
    // keeps that assertion live instead of bypassing it. It also cancels the
    // bookings and raises refunds inside one transaction.
    result = await cancelLeg({ legId, reason, operatorId: leg.operatorId });
  } catch (err) {
    fail(back, err instanceof Error ? err.message : "Could not cancel this departure");
  }

  await audit({
    entityType: "LEG",
    entityId: legId,
    action: "cancelled_by_admin",
    userId: session.sub,
    userRole: "ADMIN",
    previousState: { status: leg.status },
    newState: {
      status: "CANCELLED",
      reason,
      operatorId: leg.operatorId,
      cancelledBookings: result.cancelledBookings,
      pendingRefunds: result.pendingRefunds,
    },
  });

  revalidatePath(back);
  redirect(`${back}?ok=1`);
}


export async function adjustDeparturePrice(formData: FormData) {
  const session = await requireSuperAdmin();
  const legId = String(formData.get("legId") ?? "");
  if (!legId) redirect(OPS);
  const back = `${OPS}/departures/${legId}`;

  // Same bounds as a schedule's base price, so one departure cannot be priced
  // somewhere the schedule form would refuse.
  const parsed = z.coerce
    .number()
    .int()
    .min(1000)
    .max(50_000_000)
    .safeParse(formData.get("basePrice"));
  if (!parsed.success) {
    fail(back, "Price must be a whole number between 1,000 and 50,000,000 IDR");
  }
  const newPrice = parsed.data;

  const leg = await prisma.leg.findUnique({
    where: { id: legId },
    select: { id: true, operatorId: true, status: true, basePrice: true },
  });
  if (!leg) fail(OPS, "Departure not found");
  if (leg.status === "CANCELLED" || leg.status === "SAILED") {
    fail(back, `Cannot reprice a ${leg.status.toLowerCase()} departure`);
  }

  const previous = Number(leg.basePrice);
  if (previous === newPrice) redirect(`${back}?ok=1`);

  await prisma.leg.update({
    where: { id: legId },
    data: { basePrice: newPrice },
  });

  await audit({
    entityType: "LEG",
    entityId: legId,
    action: "price_adjusted_by_admin",
    userId: session.sub,
    userRole: "ADMIN",
    previousState: { basePrice: previous },
    newState: { basePrice: newPrice, operatorId: leg.operatorId },
  });

  revalidatePath(back);
  redirect(`${back}?ok=1`);
}

export async function deleteSchedule(formData: FormData) {
  const session = await requireSuperAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) redirect(`${OPS}/schedules`);
  const back = `${OPS}/schedules/${id}`;

  const existing = await scheduleWithOwner(id);
  if (!existing) fail(`${OPS}/schedules`, "Schedule not found");

  const now = new Date();

  // Refuse while customers still hold seats on a future sailing. Deleting would
  // strand them: they keep a ticket for a departure the operator can no longer
  // see. Cancelling a departure already refunds correctly, so send the admin
  // through that path rather than growing a second, weaker one here.
  const bookedLegs = await prisma.leg.count({
    where: {
      scheduleId: id,
      departureDate: { gte: now },
      status: { not: "CANCELLED" },
      bookings: { some: { status: { in: ["CONFIRMED", "PENDING_PAYMENT"] } } },
    },
  });
  if (bookedLegs > 0) {
    fail(
      back,
      `${bookedLegs} upcoming departure(s) still have bookings — cancel those first, which refunds the customers.`,
    );
  }

  // Soft delete only: Schedule -> Leg is onDelete: Restrict, so a row with any
  // departure cannot be removed, and the departures are the audit trail for
  // every booking ever taken on this route.
  //
  // Hiding the schedule is not enough on its own. Customer search excludes
  // deleted schedules, but /book/[legId] resolves a departure directly and
  // checks only leg.status, so a stale link would keep selling. Closing the
  // remaining future departures is what actually stops the sale.
  const [, closed] = await prisma.$transaction([
    prisma.schedule.update({
      where: { id },
      data: { deletedAt: now, status: "INACTIVE" },
    }),
    prisma.leg.updateMany({
      where: {
        scheduleId: id,
        departureDate: { gte: now },
        status: { in: ["OPEN", "FULL"] },
      },
      data: { status: "CANCELLED", cancellationReason: "Schedule deleted" },
    }),
  ]);

  await audit({
    entityType: "SCHEDULE",
    entityId: id,
    action: "deleted_by_admin",
    userId: session.sub,
    userRole: "ADMIN",
    previousState: { status: existing.status, deletedAt: null },
    newState: {
      status: "INACTIVE",
      deletedAt: now.toISOString(),
      operatorId: existing.boat.operatorId,
      closedDepartures: closed.count,
    },
  });

  revalidatePath(`${OPS}/schedules`);
  redirect(`${OPS}/schedules?ok=1`);
}
