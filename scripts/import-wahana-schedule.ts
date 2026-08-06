/**
 * Replace every published schedule with PT Wahana Virendra Group's price sheet.
 *
 * Run with --dry-run first: it prints exactly what it would retire and create
 * without touching anything.
 *
 *   pnpm tsx scripts/import-wahana-schedule.ts --dry-run
 *   pnpm tsx scripts/import-wahana-schedule.ts
 */

import { Prisma } from "@prisma/client";
import { prisma } from "../lib/db";
import { generateLegsForSchedule, BOOKING_HORIZON_DAYS } from "../lib/legs";
import { canonicalPortName } from "../lib/port-info";
import { baseFareOf } from "../lib/fares";
import { WAHANA_DEPARTURES, WAHANA_OPERATOR } from "../lib/wahana-schedule";

const dryRun = process.argv.includes("--dry-run");

function say(...args: unknown[]) {
  console.log(dryRun ? "[dry-run]" : "[import]", ...args);
}

async function main() {
  const operator = await prisma.operator.findFirst({
    where: { companyName: WAHANA_OPERATOR, deletedAt: null },
  });
  if (!operator) {
    throw new Error(
      `No active operator named "${WAHANA_OPERATOR}". Create it in /admin first — ` +
        `this script will not invent an operator to hang real sailings off.`,
    );
  }

  // Boats carry the seat count, which is what stops a sailing being oversold.
  // The price sheet has no capacity column, so a missing boat is a hard stop
  // rather than a guess.
  const boatNames = [...new Set(WAHANA_DEPARTURES.map((d) => d.boat))];
  const boats = await prisma.boat.findMany({
    where: { operatorId: operator.id, name: { in: boatNames }, deletedAt: null },
  });
  const byName = new Map(boats.map((b) => [b.name, b]));
  const missing = boatNames.filter((n) => !byName.has(n));
  if (missing.length) {
    throw new Error(
      `Missing boats for ${WAHANA_OPERATOR}: ${missing.join(", ")}. ` +
        `Add them in the operator dashboard with their real capacity and ` +
        `registration number, then re-run.`,
    );
  }
  for (const [name, boat] of byName) {
    say(`boat ${name}: capacity ${boat.capacity}, reg ${boat.registrationNumber}`);
  }

  const live = await prisma.schedule.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      originPort: true,
      destinationPort: true,
      departureTime: true,
      boat: { select: { name: true, operator: { select: { companyName: true } } } },
      _count: { select: { legs: true } },
    },
  });
  say(`retiring ${live.length} existing schedule(s):`);
  for (const s of live) {
    say(
      `  - ${s.boat.operator.companyName} / ${s.boat.name} ` +
        `${s.originPort} -> ${s.destinationPort} ${s.departureTime} (${s._count.legs} legs)`,
    );
  }

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

  const created = await prisma.$transaction(async (tx) => {
    // Soft-delete, never hard: legs, bookings, tickets and refund rights for
    // sailings already sold have to survive their schedule being withdrawn.
    const retired = await tx.schedule.updateMany({
      where: { deletedAt: null },
      data: { deletedAt: new Date(), status: "INACTIVE" },
    });
    say(`retired ${retired.count} schedule(s)`);

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
