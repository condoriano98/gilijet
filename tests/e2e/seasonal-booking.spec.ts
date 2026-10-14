import { test, expect, type Page } from '@playwright/test';
import { loadEnvConfig } from '@next/env';
import { PrismaClient } from '@prisma/client';

loadEnvConfig(process.cwd());

/**
 * Booking through the real form, in each season, stopping at the payment page.
 * It never pays: the booking must exist as PENDING_PAYMENT with the season's
 * price and the season recorded on it. Run with all payment and messaging keys
 * blanked (mock mode) — local env files can hold production keys.
 *
 * `QC_SHOTS=1` saves screenshots to test-results/qc/ for a manual look.
 * Own fixtures in 2096, removed afterwards. Relies on `pnpm seed:qa` (QA boat).
 */
const prisma = new PrismaClient();

const ORIGIN = 'E2E Booking Origin';
const DESTINATION = 'E2E Booking Dest';
const EMAIL = 'e2e-season-booking@example.invalid';
const SEASON_IDS = ['e2e-booking-high', 'e2e-booking-peak', 'e2e-booking-off'];

const fares = (adult: number) => ({ adult, child: adult / 2, infant: 0 });
const FARE_MATRIX = {
  oneWay: { low: fares(100_000), high: fares(150_000), peak: fares(200_000) },
  return: { low: fares(100_000), high: fares(150_000), peak: fares(200_000) },
};

const DATES = { high: '2096-06-12', peak: '2096-06-15', off: '2096-07-15' };
const legIds = {} as Record<keyof typeof DATES, string>;

const shot = async (page: Page, name: string) => {
  if (process.env.QC_SHOTS) await page.screenshot({ path: `test-results/qc/${name}.png`, fullPage: true });
};

async function cleanup() {
  const schedules = await prisma.schedule.findMany({
    where: { originPort: ORIGIN, destinationPort: DESTINATION },
    select: { id: true },
  });
  const ids = schedules.map((s) => s.id);
  const legs = await prisma.leg.findMany({ where: { scheduleId: { in: ids } }, select: { id: true } });
  const legList = legs.map((l) => l.id);
  const bookings = await prisma.booking.findMany({
    where: { OR: [{ customerEmail: EMAIL }, { legId: { in: legList } }] },
    select: { id: true },
  });
  const bookingIds = bookings.map((b) => b.id);
  await prisma.payment.deleteMany({ where: { bookingId: { in: bookingIds } } });
  await prisma.booking.deleteMany({ where: { id: { in: bookingIds } } });
  await prisma.leg.deleteMany({ where: { id: { in: legList } } });
  await prisma.schedule.deleteMany({ where: { id: { in: ids } } });
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
  const day = (ymd: string) => new Date(`${ymd}T00:00:00Z`);
  await prisma.season.createMany({
    data: [
      { id: SEASON_IDS[0], type: 'HIGH', startDate: day('2096-06-10'), endDate: day('2096-06-20') },
      { id: SEASON_IDS[1], type: 'PEAK', startDate: day('2096-06-15'), endDate: day('2096-06-15') },
      { id: SEASON_IDS[2], type: 'OFF', startDate: day('2096-07-15'), endDate: day('2096-07-15') },
    ],
  });
  for (const [key, ymd] of Object.entries(DATES)) {
    const leg = await prisma.leg.create({
      data: {
        scheduleId: schedule.id,
        operatorId: boat.operatorId,
        departureDate: new Date(`${ymd}T01:00:00Z`),
        basePrice: 100_000,
        status: 'OPEN',
      },
    });
    legIds[key as keyof typeof DATES] = leg.id;
  }
});

test.afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

const searchUrl = (ymd: string) =>
  `/search?origin=${encodeURIComponent(ORIGIN)}&destination=${encodeURIComponent(DESTINATION)}&date=${ymd}&passengers=2`;

async function bookAdultAndChild(page: Page, legId: string) {
  await page.goto(`/book/${legId}?passengers=2`);
  await page.locator('#passengerName-0').fill('E2E Adult');
  await page.locator('#passengerName-1').fill('E2E Child');
  await page.locator('#passengerType-1').selectOption('CHILD');
  await page.locator('#customerName').fill('E2E Season Booker');
  await page.locator('#customerEmail').fill(EMAIL);
  await page.getByPlaceholder('812 3456 7890').fill('8123456789');
  await page.locator('input[name="agreedToTerms"]').check();
}

for (const c of [
  { season: 'HIGH' as const, key: 'high' as const, total: 150_000 + 75_000, label: 'Rp 225.000' },
  { season: 'PEAK' as const, key: 'peak' as const, total: 200_000 + 100_000, label: 'Rp 300.000' },
]) {
  test(`${c.season}: form total, booking row and payment page agree`, async ({ page }) => {
    await page.goto(searchUrl(DATES[c.key]));
    await expect(page.locator('body')).toContainText(`${c.season === 'PEAK' ? 'Peak' : 'High'} season`, { timeout: 15_000 });
    await shot(page, `${c.season}-1-search`);

    await bookAdultAndChild(page, legIds[c.key]);
    // The price the customer sees on the button is the price they are charged.
    const pay = page.getByRole('button', { name: /^Pay\s/ });
    await expect(pay).toContainText(c.label);
    await shot(page, `${c.season}-2-book-form`);

    await pay.click();
    await page.waitForURL((u) => !u.pathname.startsWith('/book/') && !u.pathname.includes('/book'), { timeout: 30_000 });
    await expect(page.locator('body')).toContainText('Rp', { timeout: 15_000 });
    await shot(page, `${c.season}-3-after-submit`);

    const booking = await prisma.booking.findFirstOrThrow({
      where: { customerEmail: EMAIL, legId: legIds[c.key] },
      include: { payment: true },
    });
    expect(Number(booking.totalAmount)).toBe(c.total);
    expect(booking.status).toBe('PENDING_PAYMENT');
    expect(booking.seasonSnapshot).toEqual([{ legId: legIds[c.key], season: c.season }]);
    expect(Number(booking.payment!.amount)).toBe(c.total);
    expect(booking.payment!.status).toBe('PENDING');
  });
}

test('OFF: the departure is hidden and the form is not reachable', async ({ page }) => {
  await page.goto(searchUrl(DATES.off));
  await expect(page.locator('body')).toContainText(/No departures/i, { timeout: 15_000 });
  await shot(page, 'OFF-1-search');
  await page.goto(`/book/${legIds.off}?passengers=2`);
  await expect(page.locator('body')).toContainText(/no longer accepting bookings/i, { timeout: 15_000 });
  await shot(page, 'OFF-2-book');
  expect(await prisma.booking.count({ where: { legId: legIds.off } })).toBe(0);
});
