/**
 * Erase the sample operators, boats and schedules, keeping only the real one.
 *
 * The database accumulated rows from five different seed generators, two of
 * which no longer exist in the repo but had already run against the deployed
 * database. This removes them for good.
 *
 * Two things make "delete everyone but the real operator" insufficient on its
 * own, and both are handled here:
 *
 *   - The last generation of the deleted lib/seed-data.ts created eight
 *     invented vessels *under the real operator's own name*. They survive an
 *     operator-level filter, so boats are checked individually too.
 *   - A sample operator (PT. WAHANA GILI OCEAN) owns a boat literally named
 *     WAHANA VIRENDRA. Nothing here matches on substrings for that reason:
 *     what is real is whitelisted, everything else goes.
 *
 * Refuses to erase anything whose bookings carry a Payment, Refund or Ticket —
 * that is the record of money that moved. Those are reported and skipped, or
 * soft-retired with --retire-blocked so they at least stop selling.
 *
 * Dry run by default. Always read the table before passing --confirm.
 *
 *   pnpm purge:dummy
 *   pnpm purge:dummy --retire-blocked
 *   pnpm purge:dummy --confirm
 */

import { prisma } from "../lib/db";
import { activeOperator } from "../lib/operator-data";
import { WAHANA_DEPARTURES, WAHANA_OPERATOR } from "../lib/wahana-schedule";
import {
  collectBoatSubtree,
  collectOperatorSubtree,
  describeMoneyBlockers,
  purgeBoats,
  purgeOperator,
  subtreeBlockers,
  type PurgeCounts,
  type Subtree,
} from "../lib/operator-purge";

const confirm = process.argv.includes("--confirm");
const retireBlocked = process.argv.includes("--retire-blocked");

function keepOperatorIdArg(): string | null {
  const eq = process.argv.find((a) => a.startsWith("--keep-operator-id="));
  if (eq) return eq.slice("--keep-operator-id=".length);
  const i = process.argv.indexOf("--keep-operator-id");
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

function say(...args: unknown[]) {
  console.log(confirm ? "[purge]" : "[dry-run]", ...args);
}

/**
 * The registration numbers the import script derives for the real vessels.
 * Whitelisting from the price sheet means a fake vessel added under the real
 * operator later is caught without editing a blacklist.
 */
function realRegistrations(): Set<string> {
  const names = new Set(WAHANA_DEPARTURES.map((d) => d.boat));
  return new Set(
    [...names].map((n) => `WVG-${n.toUpperCase().replace(/[^A-Z0-9]+/g, "-")}`),
  );
}

/** Soft-retire, matching the semantics of `import:wahana --exclusive`. */
async function retireOperator(operatorId: string, s: Subtree) {
  const now = new Date();
  await prisma.$transaction([
    prisma.operator.update({
      where: { id: operatorId },
      data: { deletedAt: now, status: "SUSPENDED" },
    }),
    prisma.boat.updateMany({
      where: { id: { in: s.boatIds } },
      data: { deletedAt: now, status: "INACTIVE" },
    }),
    prisma.schedule.updateMany({
      where: { id: { in: s.scheduleIds } },
      data: { deletedAt: now, status: "INACTIVE" },
    }),
    prisma.leg.updateMany({
      where: {
        id: { in: s.legIds },
        departureDate: { gte: now },
        status: { in: ["OPEN", "FULL"] },
      },
      data: {
        status: "CANCELLED",
        cancellationReason: "Operator retired from the platform",
      },
    }),
  ]);
}

function tally(into: PurgeCounts, from: PurgeCounts) {
  into.bookings += from.bookings;
  into.legs += from.legs;
  into.schedules += from.schedules;
  into.boats += from.boats;
  into.staff += from.staff;
  into.promotionsRetargeted += from.promotionsRetargeted;
}

async function main() {
  const keepId = keepOperatorIdArg();
  const keeper = keepId
    ? await prisma.operator.findFirst({ where: { id: keepId, ...activeOperator } })
    : await prisma.operator.findFirst({
        where: { companyName: WAHANA_OPERATOR, ...activeOperator },
      });

  // Without this the script would happily delete all thirty operators.
  if (!keeper) {
    throw new Error(
      keepId
        ? `No active operator with id ${keepId}.`
        : `No active operator named "${WAHANA_OPERATOR}". Refusing to run — ` +
          `with no operator to keep, this would erase the entire catalogue. ` +
          `Pass --keep-operator-id <id> if the real operator is named differently.`,
    );
  }
  say(`keeping ${keeper.companyName} (${keeper.email})`);

  const totals: PurgeCounts = {
    bookings: 0,
    legs: 0,
    schedules: 0,
    boats: 0,
    staff: 0,
    promotionsRetargeted: 0,
  };
  let purged = 0;
  const blocked: string[] = [];

  // ---- Stage A: every other operator ----
  const others = await prisma.operator.findMany({
    where: { ...activeOperator, id: { not: keeper.id } },
    select: { id: true, companyName: true, email: true },
    orderBy: { companyName: "asc" },
  });
  say(`${others.length} other operator(s) to remove`);

  for (const op of others) {
    const subtree = await collectOperatorSubtree(op.id);
    const blockers = await subtreeBlockers(subtree);
    const money = describeMoneyBlockers(blockers);
    const shape =
      `${subtree.boatIds.length} boat(s), ${subtree.scheduleIds.length} schedule(s), ` +
      `${subtree.legIds.length} leg(s), ${subtree.bookingIds.length} booking(s)`;

    if (money.length > 0) {
      blocked.push(`${op.companyName} — ${money.join(", ")}`);
      say(`BLOCKED ${op.companyName}: ${money.join(", ")} on record`);
      if (retireBlocked && confirm) {
        await retireOperator(op.id, subtree);
        say(`  retired instead (suspended, future departures cancelled)`);
      } else if (retireBlocked) {
        say(`  would retire instead (suspended, future departures cancelled)`);
      }
      continue;
    }

    if (!confirm) {
      say(`DELETE ${op.companyName} — ${shape}`);
      purged += 1;
      continue;
    }

    // One transaction per operator: a blocked tenant must not roll back the
    // twenty that already succeeded.
    const counts = await purgeOperator(op.id, subtree);
    tally(totals, counts);
    purged += 1;
    say(`deleted ${op.companyName} — ${shape}`);
  }

  // ---- Stage B: invented vessels under the operator we are keeping ----
  const real = realRegistrations();
  const keeperBoats = await prisma.boat.findMany({
    where: { operatorId: keeper.id },
    select: { id: true, name: true, registrationNumber: true },
    orderBy: { name: "asc" },
  });
  const fakeBoats = keeperBoats.filter((b) => !real.has(b.registrationNumber));

  if (fakeBoats.length === 0) {
    say(`no invented vessels under ${keeper.companyName}`);
  } else {
    say(`${fakeBoats.length} invented vessel(s) under ${keeper.companyName}`);
    for (const boat of fakeBoats) {
      const subtree = await collectBoatSubtree([boat.id]);
      const blockers = await subtreeBlockers(subtree);
      const money = describeMoneyBlockers(blockers);
      const label = `${boat.name} (${boat.registrationNumber})`;

      if (money.length > 0) {
        blocked.push(`${label} — ${money.join(", ")}`);
        say(`BLOCKED ${label}: ${money.join(", ")} on record`);
        continue;
      }
      if (!confirm) {
        say(
          `DELETE ${label} — ${subtree.scheduleIds.length} schedule(s), ` +
            `${subtree.legIds.length} leg(s)`,
        );
        continue;
      }
      tally(totals, await purgeBoats(subtree));
      say(`deleted ${label}`);
    }
  }

  // ---- Summary ----
  console.log("");
  if (confirm) {
    say(
      `done — ${purged} operator(s), ${totals.boats} boat(s), ` +
        `${totals.schedules} schedule(s), ${totals.legs} leg(s), ` +
        `${totals.bookings} booking(s), ${totals.staff} staff row(s) removed`,
    );
  } else {
    say(`would remove ${purged} operator(s) and ${fakeBoats.length} invented vessel(s)`);
    say(`re-run with --confirm to apply`);
  }
  if (blocked.length) {
    console.log("");
    say(`${blocked.length} kept because money moved through them:`);
    for (const b of blocked) say(`  - ${b}`);
    if (!retireBlocked) {
      say(`pass --retire-blocked to suspend these instead of leaving them selling`);
    }
  }
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
