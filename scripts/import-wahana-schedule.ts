/**
 * Republish PT Wahana Virendra Group's timetable from their price sheet.
 *
 * Retires this operator's own live schedules and replaces them with the 24
 * sailings in lib/wahana-schedule.ts. Other operators are left alone unless
 * --exclusive is passed, which retires them too — for when the platform is
 * meant to carry this operator and nobody else.
 *
 * Vessels must exist first, because the sheet has no capacity column and
 * capacity is what stops a sailing being oversold. Either create them in the
 * dashboard or state the seat counts with --capacity.
 *
 * Always --dry-run first: it prints exactly what it would retire and create
 * without touching anything.
 *
 *   pnpm import:wahana --dry-run
 *   pnpm import:wahana --capacity "Cantika 09=80,ROSE=60,WGO 5=60" --exclusive --dry-run
 *   pnpm import:wahana --capacity "Cantika 09=80,ROSE=60,WGO 5=60" --exclusive
 */

import { Prisma } from "@prisma/client";
import { prisma } from "../lib/db";
import { generateLegsForSchedule, BOOKING_HORIZON_DAYS } from "../lib/legs";
import { canonicalPortName } from "../lib/port-info";
import { activeBoat, activeOperator, activeSchedule } from "../lib/operator-data";
import { baseFareOf } from "../lib/fares";
import { WAHANA_DEPARTURES, WAHANA_OPERATOR } from "../lib/wahana-schedule";

const dryRun = process.argv.includes("--dry-run");
const exclusive = process.argv.includes("--exclusive");

function say(...args: unknown[]) {
  console.log(dryRun ? "[dry-run]" : "[import]", ...args);
}

/**
 * `--capacity "Cantika 09=80,ROSE=60"` — seat counts for vessels that do not
 * exist yet. The sheet has no capacity column and capacity is what stops a
 * sailing being oversold, so it is supplied deliberately or not at all.
 */
function parseCapacities(): Map<string, number> {
  const arg = process.argv.find((a) => a.startsWith("--capacity="));
  const inline = arg
    ? arg.slice("--capacity=".length)
    : process.argv[process.argv.indexOf("--capacity") + 1];
  const out = new Map<string, number>();
  if (!arg && !process.argv.includes("--capacity")) return out;
  for (const pair of (inline ?? "").split(",")) {
    const at = pair.lastIndexOf("=");
    const name = pair.slice(0, at).trim();
    const seats = Number(pair.slice(at + 1).trim());
    if (!name || !Number.isInteger(seats) || seats <= 0) {
      throw new Error(
        `Bad --capacity entry ${JSON.stringify(pair)}. ` +
          `Expected "Vessel Name=seats", e.g. --capacity "ROSE=60,WGO 5=60".`,
      );
    }
    out.set(name, seats);
  }
  return out;
}

async function main() {
  const operator = await prisma.operator.findFirst({
    where: { companyName: WAHANA_OPERATOR, ...activeOperator },
  });
  if (!operator) {
    throw new Error(
      `No active operator named "${WAHANA_OPERATOR}". Create it in /admin first — ` +
        `this script will not invent an operator to hang real sailings off.`,
    );
  }

  // Boats carry the seat count, which is what stops a sailing being oversold.
  // The price sheet has no capacity column, so a vessel that does not exist yet
  // needs its seat count stated explicitly — never guessed.
  const capacities = parseCapacities();
  const boatNames = [...new Set(WAHANA_DEPARTURES.map((d) => d.boat))];
  const boats = await prisma.boat.findMany({
    where: { operatorId: operator.id, name: { in: boatNames }, ...activeBoat },
  });
  const byName = new Map(boats.map((b) => [b.name, b]));
  const missing = boatNames.filter((n) => !byName.has(n));
  const unpriced = missing.filter((n) => !capacities.has(n));
  if (unpriced.length) {
    throw new Error(
      `No vessel on record for ${WAHANA_OPERATOR}: ${unpriced.join(", ")}. ` +
        `Either add them in the operator dashboard with their real capacity and ` +
        `registration number, or pass seat counts here, e.g. ` +
        `--capacity "${unpriced.map((n) => `${n}=60`).join(",")}".`,
    );
  }
  for (const name of missing) {
    say(`will create vessel ${name} with ${capacities.get(name)} seats`);
  }
  for (const [name, boat] of byName) {
    say(`boat ${name}: capacity ${boat.capacity}, reg ${boat.registrationNumber}`);
  }

  // Everything on the platform that is not this operator. Retiring it is what
  // "these are all my company's boats" means in practice.
  const others = exclusive
    ? await prisma.operator.findMany({
        where: { ...activeOperator, id: { not: operator.id } },
        select: {
          id: true,
          companyName: true,
          boats: {
            where: activeBoat,
            select: {
              id: true,
              name: true,
              schedules: { where: activeSchedule, select: { id: true } },
            },
          },
        },
      })
    : [];
  if (exclusive) {
    say(`--exclusive: retiring ${others.length} other operator(s):`);
    for (const o of others) {
      say(`  - ${o.companyName} (${o.boats.map((b) => b.name).join(", ") || "no boats"})`);
    }
  }
  const otherBoatIds = others.flatMap((o) => o.boats.map((b) => b.id));
  const otherScheduleIds = others.flatMap((o) =>
    o.boats.flatMap((b) => b.schedules.map((s) => s.id)),
  );

  // Scoped to this operator's own boats. An unscoped retire would withdraw
  // every other operator on the platform as a side effect of republishing one
  // timetable.
  const live = await prisma.schedule.findMany({
    where: { ...activeSchedule, boat: { operatorId: operator.id } },
    select: {
      id: true,
      originPort: true,
      destinationPort: true,
      departureTime: true,
      boat: { select: { name: true } },
      _count: { select: { legs: true } },
    },
  });
  say(`retiring ${live.length} existing ${WAHANA_OPERATOR} schedule(s):`);
  for (const s of live) {
    say(
      `  - ${s.boat.name} ${s.originPort} -> ${s.destinationPort} ` +
        `${s.departureTime} (${s._count.legs} legs)`,
    );
  }

  const retiringIds = live.map((s) => s.id);
  const now = new Date();

  // Withdrawing a sailing someone holds a ticket for strands them. Cancelling
  // the departure through the admin flow refunds correctly; this script has no
  // business growing a second, weaker version of that.
  const bookedLegs = await prisma.leg.count({
    where: {
      scheduleId: { in: [...retiringIds, ...otherScheduleIds] },
      departureDate: { gte: now },
      status: { not: "CANCELLED" },
      bookings: { some: { status: { in: ["CONFIRMED", "AWAITING_CONFIRMATION", "PENDING_PAYMENT"] } } },
    },
  });
  const blocked =
    bookedLegs > 0
      ? `${bookedLegs} upcoming departure(s) still have bookings. Cancel them in ` +
        `/admin/operations first — that refunds the customers — then re-run.`
      : null;
  // In a dry run this is information, not a failure: report it and carry on
  // printing so the operator sees the whole picture in one pass.
  if (blocked) say(`BLOCKED: ${blocked}`);

  say(`creating ${WAHANA_DEPARTURES.length} departure(s):`);
  for (const d of WAHANA_DEPARTURES) {
    const stops = d.transitStops.length
      ? ` via ${d.transitStops.map((s) => `${s.portName}@${s.time}`).join(", ")}`
      : "";
    say(
      `  + ${d.boat} ${canonicalPortName(d.origin)} -> ${canonicalPortName(d.destination)} ` +
        `${d.departureTime}-${d.arrivalTime} (${d.durationMinutes}m) ` +
        `Rp${d.basePrice.toLocaleString("id-ID")}${stops}`,
    );
  }

  if (dryRun) {
    say("nothing written.");
    return;
  }
  if (blocked) throw new Error(blocked);

  const created = await prisma.$transaction(async (tx) => {
    // Soft-delete, never hard: legs, bookings, tickets and refund rights for
    // sailings already sold have to survive their schedule being withdrawn.
    const retired = await tx.schedule.updateMany({
      where: { id: { in: retiringIds } },
      data: { deletedAt: now, status: "INACTIVE" },
    });

    // Hiding the schedule is not enough. Search excludes deleted schedules, but
    // /book/[legId] resolves a departure directly and checks only leg.status,
    // so an old link keeps selling until the departures themselves are closed.
    const closed = await tx.leg.updateMany({
      where: {
        scheduleId: { in: retiringIds },
        departureDate: { gte: now },
        status: { in: ["OPEN", "FULL"] },
      },
      data: {
        status: "CANCELLED",
        cancellationReason: "Timetable replaced by operator price sheet import",
      },
    });
    say(`retired ${retired.count} schedule(s), closed ${closed.count} future leg(s)`);

    if (exclusive && others.length) {
      const [ops, otherBoats, otherScheds, otherLegs] = await Promise.all([
        tx.operator.updateMany({
          where: { id: { in: others.map((o) => o.id) } },
          data: { deletedAt: now, status: "SUSPENDED" },
        }),
        tx.boat.updateMany({
          where: { id: { in: otherBoatIds } },
          data: { deletedAt: now, status: "INACTIVE" },
        }),
        tx.schedule.updateMany({
          where: { id: { in: otherScheduleIds } },
          data: { deletedAt: now, status: "INACTIVE" },
        }),
        tx.leg.updateMany({
          where: {
            scheduleId: { in: otherScheduleIds },
            departureDate: { gte: now },
            status: { in: ["OPEN", "FULL"] },
          },
          data: {
            status: "CANCELLED",
            cancellationReason: "Operator retired from the platform",
          },
        }),
      ]);
      say(
        `retired ${ops.count} other operator(s), ${otherBoats.count} boat(s), ` +
          `${otherScheds.count} schedule(s); closed ${otherLegs.count} future leg(s)`,
      );
    }

    // Registration numbers are the boat's unique key, and the sheet has none.
    // Derive a stable placeholder so a re-run finds the same vessel instead of
    // creating a duplicate; the operator can correct it in the dashboard.
    for (const name of missing) {
      const boat = await tx.boat.create({
        data: {
          operatorId: operator.id,
          name,
          registrationNumber: `WVG-${name.toUpperCase().replace(/[^A-Z0-9]+/g, "-")}`,
          capacity: capacities.get(name)!,
          photos: [],
          description: `${WAHANA_OPERATOR} vessel, from the operator price sheet.`,
          status: "ACTIVE",
        },
      });
      byName.set(name, boat);
      say(`created vessel ${name} (${boat.capacity} seats, reg ${boat.registrationNumber})`);
    }

    const ids: string[] = [];
    for (const d of WAHANA_DEPARTURES) {
      const boat = byName.get(d.boat)!;
      const schedule = await tx.schedule.create({
        data: {
          boatId: boat.id,
          originPort: canonicalPortName(d.origin),
          destinationPort: canonicalPortName(d.destination),
          departureTime: d.departureTime,
          durationMinutes: d.durationMinutes,
          basePrice: new Prisma.Decimal(baseFareOf(d.fares)),
          daysOfWeek: d.daysOfWeek,
          status: "ACTIVE",
          fareMatrix: d.fares as unknown as Prisma.InputJsonValue,
          transitStops: {
            create: d.transitStops.map((s, i) => ({
              portName: canonicalPortName(s.portName),
              // The sheet gives one time per call, not an arrive/depart pair.
              // Repeating it says "calls here at" instead of inventing a dwell.
              arrivalTime: s.time,
              departureTime: s.time,
              orderIndex: i,
            })),
          },
        },
      });
      ids.push(schedule.id);
    }
    return ids;
  });

  say(`created ${created.length} schedule(s); generating legs...`);
  let legs = 0;
  for (const id of created) {
    legs += await generateLegsForSchedule(id, BOOKING_HORIZON_DAYS);
  }
  say(`generated ${legs} leg(s) across ${BOOKING_HORIZON_DAYS} days`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err instanceof Error ? err.message : err);
    await prisma.$disconnect();
    process.exit(1);
  });
