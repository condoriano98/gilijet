/**
 * Retire every operator that is not PT Wahana Virendra Group.
 *
 * The deployed database accumulated sample operators from prisma/seed.ts, which
 * docker/entrypoint.sh re-ran on every container boot. This withdraws them and
 * their vessels from sale.
 *
 * Dry run first — it prints exactly what it would touch without writing:
 *
 *   pnpm tsx scripts/retire-non-wahana.ts --dry-run
 *   pnpm tsx scripts/retire-non-wahana.ts
 */

import { prisma } from "../lib/db";
import { activeBoat, activeOperator, activeSchedule } from "../lib/operator-data";
import { WAHANA_OPERATOR } from "../lib/wahana-schedule";

const dryRun = process.argv.includes("--dry-run");

function say(...args: unknown[]) {
  console.log(dryRun ? "[dry-run]" : "[retire]", ...args);
}

async function main() {
  const doomed = await prisma.operator.findMany({
    where: { ...activeOperator, companyName: { not: WAHANA_OPERATOR } },
    select: {
      id: true,
      companyName: true,
      email: true,
      boats: {
        where: activeBoat,
        select: {
          id: true,
          name: true,
          schedules: {
            where: activeSchedule,
            select: { id: true, originPort: true, destinationPort: true, departureTime: true },
          },
        },
      },
    },
  });

  if (doomed.length === 0) {
    say(`nothing to do — ${WAHANA_OPERATOR} is already the only active operator.`);
    return;
  }

  const boatIds = doomed.flatMap((o) => o.boats.map((b) => b.id));
  const scheduleIds = doomed.flatMap((o) => o.boats.flatMap((b) => b.schedules.map((s) => s.id)));
  const now = new Date();

  say(`retiring ${doomed.length} operator(s):`);
  for (const op of doomed) {
    say(`  - ${op.companyName} <${op.email}> — ${op.boats.length} boat(s)`);
    for (const boat of op.boats) {
      say(`      ${boat.name}: ${boat.schedules.length} schedule(s)`);
      for (const s of boat.schedules) {
        say(`        ${s.originPort} -> ${s.destinationPort} ${s.departureTime}`);
      }
    }
  }

  const futureLegs = await prisma.leg.count({
    where: {
      scheduleId: { in: scheduleIds },
      departureDate: { gte: now },
      status: { in: ["OPEN", "FULL"] },
    },
  });
  say(`${futureLegs} future departure(s) will be cancelled`);

  // Refuse rather than strand anyone holding a seat. Cancelling a departure
  // through /admin/operations refunds the customer; retiring the operator out
  // from under them would not.
  const bookedLegs = await prisma.leg.count({
    where: {
      scheduleId: { in: scheduleIds },
      departureDate: { gte: now },
      status: { not: "CANCELLED" },
      bookings: { some: { status: { in: ["CONFIRMED", "PENDING_PAYMENT"] } } },
    },
  });
  const blocked =
    bookedLegs > 0
      ? `${bookedLegs} upcoming departure(s) still have bookings. Cancel them in ` +
        `/admin/operations first — that refunds the customers — then re-run.`
      : null;
  // A dry run reports this rather than aborting, so one pass shows everything.
  if (blocked) say(`BLOCKED: ${blocked}`);

  if (dryRun) {
    say("nothing written.");
    return;
  }
  if (blocked) throw new Error(blocked);

  // Soft-delete throughout: every cascade in the financial chain is Restrict,
  // and the bookings, tickets and refunds hanging off these rows are the audit
  // trail for money that actually moved.
  //
  // Closing the future legs is the part that stops the sale. Search filters on
  // schedule.deletedAt, but /book/[legId] resolves a departure directly and
  // checks only leg.status, so a stale link outlives the schedule.
  const [operators, boats, schedules, legs] = await prisma.$transaction([
    prisma.operator.updateMany({
      where: { id: { in: doomed.map((o) => o.id) } },
      data: { deletedAt: now, status: "SUSPENDED" },
    }),
    prisma.boat.updateMany({
      where: { id: { in: boatIds } },
      data: { deletedAt: now, status: "INACTIVE" },
    }),
    prisma.schedule.updateMany({
      where: { id: { in: scheduleIds } },
      data: { deletedAt: now, status: "INACTIVE" },
    }),
    prisma.leg.updateMany({
      where: {
        scheduleId: { in: scheduleIds },
        departureDate: { gte: now },
        status: { in: ["OPEN", "FULL"] },
      },
      data: { status: "CANCELLED", cancellationReason: "Operator retired from the platform" },
    }),
  ]);

  say(
    `retired ${operators.count} operator(s), ${boats.count} boat(s), ` +
      `${schedules.count} schedule(s); cancelled ${legs.count} future departure(s)`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err instanceof Error ? err.message : err);
    await prisma.$disconnect();
    process.exit(1);
  });
