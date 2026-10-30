/**
 * Padang Bai → Senggigi and the way back, each priced Rp 1, for testing live DOKU
 * payments on staging without spending real money. See
 * docs/spikes/done/DOKU_ONE_RUPIAH_STAGING.md.
 *
 * The schedule sits on the QA boat (never on a real operator's boat), has no
 * fare matrix so the season never changes its price, and gets departures for
 * the whole booking horizon. Re-run to top the window up (the staging cron does
 * not run).
 *
 * Writes to whatever DATABASE_URL points at, so it needs the project ref:
 *   CONFIRM_PROJECT_REF=<ref> pnpm seed:one-rupiah
 *   CONFIRM_PROJECT_REF=<ref> pnpm seed:one-rupiah --remove
 */
import { Prisma, PrismaClient } from '@prisma/client';
import { BOOKING_HORIZON_DAYS, generateLegsForSchedule } from '../src/features/schedules/legs';
import { ONE_RUPIAH_SCHEDULES, assertConfirmedTarget } from './lib/one-rupiah';

type Def = (typeof ONE_RUPIAH_SCHEDULES)[number];

const prisma = new PrismaClient();

async function find(S: Def) {
  const boat = await prisma.boat.findUnique({ where: { registrationNumber: S.boatRegistration } });
  if (!boat) throw new Error(`Boat ${S.boatRegistration} not found; run seed:qa first.`);
  const schedule = await prisma.schedule.findUnique({
    where: {
      boatId_originPort_destinationPort_departureTime: {
        boatId: boat.id,
        originPort: S.originPort,
        destinationPort: S.destinationPort,
        departureTime: S.departureTime,
      },
    },
  });
  return { boat, schedule };
}

async function remove(S: Def) {
  const { schedule } = await find(S);
  if (!schedule) return console.log('Nothing to remove.');
  const free = await prisma.leg.deleteMany({
    where: {
      scheduleId: schedule.id,
      bookings: { none: {} },
      outboundBookings: { none: {} },
      returnBookings: { none: {} },
      seatHolds: { none: {} },
      reschedulesAsOriginal: { none: {} },
      reschedulesAsRequested: { none: {} },
      ticketCheckins: { none: {} },
    },
  });
  await prisma.schedule.update({
    where: { id: schedule.id },
    data: { status: 'INACTIVE', deletedAt: new Date() },
  });
  console.log(`Schedule ${schedule.id} retired; ${free.count} unbooked departures deleted.`);
}

async function seed(S: Def) {
  const { boat, schedule: existing } = await find(S);
  const ports = await prisma.port.findMany({
    where: { name: { in: [S.originPort, S.destinationPort] }, deletedAt: null },
    select: { id: true, name: true },
  });
  const portId = (name: string) => ports.find((p) => p.name === name)?.id ?? null;

  const data = {
    durationMinutes: S.durationMinutes,
    basePrice: S.basePrice,
    daysOfWeek: [...S.daysOfWeek],
    status: 'ACTIVE' as const,
    originPortId: portId(S.originPort),
    destinationPortId: portId(S.destinationPort),
    deletedAt: null,
  };
  const schedule = existing
    ? await prisma.schedule.update({ where: { id: existing.id }, data: { ...data, fareMatrix: Prisma.DbNull } })
    : await prisma.schedule.create({
        data: {
          ...data,
          boatId: boat.id,
          originPort: S.originPort,
          destinationPort: S.destinationPort,
          departureTime: S.departureTime,
        },
      });
  const created = await generateLegsForSchedule(schedule.id, BOOKING_HORIZON_DAYS);
  const legs = await prisma.leg.count({ where: { scheduleId: schedule.id, status: 'OPEN' } });
  console.log(
    `Schedule ${schedule.id}: ${S.originPort} → ${S.destinationPort} ${S.departureTime}, Rp ${S.basePrice}; ` +
      `ports linked: ${!!data.originPortId && !!data.destinationPortId}; ${created} departures added, ${legs} open.`,
  );
}

async function main() {
  const ref = assertConfirmedTarget(process.env.DATABASE_URL, process.env.CONFIRM_PROJECT_REF);
  console.log(`Target Supabase project: ${ref}`);
  for (const def of ONE_RUPIAH_SCHEDULES) {
    if (process.argv.includes('--remove')) await remove(def);
    else await seed(def);
  }
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
