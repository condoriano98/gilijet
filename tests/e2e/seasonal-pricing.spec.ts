import { test, expect } from '@playwright/test';
import { loadEnvConfig } from '@next/env';
import { PrismaClient } from '@prisma/client';

loadEnvConfig(process.cwd());

/**
 * Seasonal pricing: the price on /search, the price on the book page and the
 * OFF-day closure all come from the same resolver the booking engine charges
 * with. Nothing here creates a booking.
 *
 * Builds its own schedule, legs and Season rows in the year 2099 so the real
 * calendar and the 60-day leg window never affect it, and removes them again.
 * Relies on `pnpm seed:qa` (for the QA boat).
 */
const prisma = new PrismaClient();

const ORIGIN = 'E2E Season Origin';
const DESTINATION = 'E2E Season Dest';
const SEASON_IDS = ['e2e-season-high', 'e2e-season-peak', 'e2e-season-low', 'e2e-season-off'];

const fares = (adult: number) => ({ adult, child: adult / 2, infant: 0 });
const FARE_MATRIX = {
  oneWay: { low: fares(100_000), high: fares(150_000), peak: fares(200_000) },
  return: { low: fares(100_000), high: fares(150_000), peak: fares(200_000) },
};

// 09:00 WITA = 01:00 UTC the same calendar day.
const at = (ymd: string) => new Date(`${ymd}T01:00:00Z`);
const day = (ymd: string) => new Date(`${ymd}T00:00:00Z`);

const LEG_DATES = {
  high: '2099-06-12',
  peak: '2099-06-15', // inside the HIGH range too: PEAK must win
  overridden: '2099-06-16', // HIGH season, but the price was set by hand
  low: '2099-07-10',
  off: '2099-07-15', // inside the LOW range too: OFF must win
  none: '2099-09-10', // no season row: normal price
};

let legIds: Record<keyof typeof LEG_DATES, string>;

async function cleanup() {
  const schedules = await prisma.schedule.findMany({
    where: { originPort: ORIGIN, destinationPort: DESTINATION },
    select: { id: true },
  });
  const scheduleIds = schedules.map((s) => s.id);
  await prisma.leg.deleteMany({ where: { scheduleId: { in: scheduleIds } } });
  await prisma.schedule.deleteMany({ where: { id: { in: scheduleIds } } });
  await prisma.season.deleteMany({ where: { id: { in: SEASON_IDS } } });
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  await cleanup();

  const boat = await prisma.boat.findUniqueOrThrow({ where: { registrationNumber: 'QA-BOAT-001' } });
  const schedule = await prisma.schedule.create({
    data: {
      boatId: boat.id,
      originPort: ORIGIN,
      destinationPort: DESTINATION,
      departureTime: '09:00',
      durationMinutes: 45,
      basePrice: 100_000,
      daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
      status: 'ACTIVE',
      fareMatrix: FARE_MATRIX,
    },
  });

  await prisma.season.createMany({
    data: [
      { id: 'e2e-season-high', type: 'HIGH', startDate: day('2099-06-10'), endDate: day('2099-06-20') },
      { id: 'e2e-season-peak', type: 'PEAK', startDate: day('2099-06-15'), endDate: day('2099-06-15') },
      { id: 'e2e-season-low', type: 'LOW', startDate: day('2099-07-01'), endDate: day('2099-07-31') },
      { id: 'e2e-season-off', type: 'OFF', startDate: day('2099-07-15'), endDate: day('2099-07-15'), note: 'e2e' },
    ],
  });

  const ids = {} as typeof legIds;
  for (const [key, ymd] of Object.entries(LEG_DATES)) {
    const overridden = key === 'overridden';
    const leg = await prisma.leg.create({
      data: {
        scheduleId: schedule.id,
        operatorId: boat.operatorId,
        departureDate: at(ymd),
        basePrice: overridden ? 120_000 : 100_000,
        priceOverridden: overridden,
        status: 'OPEN',
      },
    });
    ids[key as keyof typeof LEG_DATES] = leg.id;
  }
  legIds = ids;
});

test.afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

const searchUrl = (ymd: string) =>
  `/search?origin=${encodeURIComponent(ORIGIN)}&destination=${encodeURIComponent(DESTINATION)}&date=${ymd}&passengers=1`;

const CASES: { name: keyof typeof LEG_DATES; price: string; badge: RegExp | null }[] = [
  { name: 'none', price: 'Rp 100.000', badge: null },
  { name: 'low', price: 'Rp 100.000', badge: null },
  { name: 'high', price: 'Rp 150.000', badge: /High season/ },
  { name: 'peak', price: 'Rp 200.000', badge: /Peak season/ },
  { name: 'overridden', price: 'Rp 120.000', badge: null },
];

for (const c of CASES) {
  test(`${c.name}: search and book page show ${c.price}`, async ({ page }) => {
    await page.goto(searchUrl(LEG_DATES[c.name]));
    const body = page.locator('body');
    await expect(body).toContainText(c.price, { timeout: 15_000 });
    if (c.badge) await expect(body).toContainText(c.badge);
    else await expect(body).not.toContainText(/High season|Peak season/);

    // The fare the customer is shown must be the fare they are about to pay.
    await page.goto(`/book/${legIds[c.name]}?passengers=1`);
    const total = page.getByText('Total', { exact: true }).locator('xpath=..');
    await expect(total).toContainText(c.price, { timeout: 15_000 });
  });
}

test('off: the departure is hidden from search and cannot be booked', async ({ page }) => {
  await page.goto(searchUrl(LEG_DATES.off));
  await expect(page.locator('body')).toContainText(/No departures/i, { timeout: 15_000 });
  await expect(page.locator('body')).not.toContainText('Rp 100.000');

  await page.goto(`/book/${legIds.off}?passengers=1`);
  await expect(page.locator('body')).toContainText(/no longer accepting bookings/i, { timeout: 15_000 });
});
