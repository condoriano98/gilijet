/**
 * Season calendar for 2026/27, from the business season table.
 *
 * Re-runs are safe: every row is upserted by a fixed id. Rows removed or
 * edited in /admin/console/seasons are left alone only if their id is not
 * listed here — an edited seed row is reset to the values below.
 *
 * Run: `pnpm seed:seasons`
 */
import { PrismaClient, type SeasonType } from '@prisma/client';

const prisma = new PrismaClient();

const SEASONS: { id: string; type: SeasonType; start: string; end: string; note?: string }[] = [
  { id: 'season-2026-peak-xmas', type: 'PEAK', start: '2026-12-25', end: '2026-12-25', note: 'Natal' },
  { id: 'season-2027-peak-newyear', type: 'PEAK', start: '2027-01-01', end: '2027-01-02', note: 'Tahun Baru' },
  { id: 'season-2027-high-jan', type: 'HIGH', start: '2027-01-03', end: '2027-01-31' },
  { id: 'season-2026-high-dec', type: 'HIGH', start: '2026-12-01', end: '2026-12-31' },
  { id: 'season-2027-low-feb', type: 'LOW', start: '2027-02-01', end: '2027-02-28' },
  { id: 'season-2027-low-mar', type: 'LOW', start: '2027-03-01', end: '2027-03-31' },
  { id: 'season-2027-low-apr', type: 'LOW', start: '2027-04-01', end: '2027-04-30' },
  { id: 'season-2027-off-nyepi', type: 'OFF', start: '2027-03-27', end: '2027-03-27', note: 'Nyepi' },
];

async function main() {
  const host = (process.env.DATABASE_URL ?? '').match(/@([^/:]+)/)?.[1] ?? '?';
  if (/prod|production/i.test(process.env.DATABASE_URL ?? '')) {
    throw new Error(`Refusing to seed a production-looking DB (${host}).`);
  }
  console.log(`Seeding seasons into ${host}`);

  for (const s of SEASONS) {
    const data = {
      type: s.type,
      startDate: new Date(`${s.start}T00:00:00Z`),
      endDate: new Date(`${s.end}T00:00:00Z`),
      note: s.note ?? null,
      isActive: true,
      deletedAt: null,
    };
    await prisma.season.upsert({ where: { id: s.id }, create: { id: s.id, ...data }, update: data });
    console.log(`✓ ${s.type.padEnd(4)} ${s.start} → ${s.end}${s.note ? `  ${s.note}` : ''}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
