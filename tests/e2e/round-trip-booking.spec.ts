import { test, expect } from '@playwright/test';
import { loadEnvConfig } from '@next/env';
import { PrismaClient } from '@prisma/client';
import { requireMockPayments, payInMockMode } from './support/mock-payments';
import { removeBookings, removeSchedules } from './support/fixtures';

loadEnvConfig(process.cwd());
requireMockPayments();

/**
 * Round trip, end to end: search with a return date, pick an outbound and a
 * return departure, fill the passenger form once, see what each leg costs, pay
 * on the mock checkout. One booking covers both legs.
 *
 * Own routes in 2093 (outbound A→B, return B→A, with different fares so the
 * Outbound / Return lines cannot be confused) removed afterwards.
 * `requireMockPayments()` skips the file when a live key is set. `QC_SHOTS=1`
 * saves a screenshot of the form to test-results/qc/.
 */
const prisma = new PrismaClient();

const A = 'E2E Trip A';
const B = 'E2E Trip B';
const EMAIL = 'e2e-round-trip@example.invalid';
const OUT_DATE = '2093-06-12';
const RET_DATE = '2093-06-14';

const matrix = (adult: number) => {
  const cell = { adult, child: adult / 2, infant: 0 };
  const season = { low: cell, high: cell, peak: cell };
  return { oneWay: season, return: season };
};

test.beforeAll(async () => {
  await removeBookings(prisma, { customerEmail: EMAIL });
  await removeSchedules(prisma, [A, B]);
  const boat = await prisma.boat.findUniqueOrThrow({ where: { registrationNumber: 'QA-BOAT-001' } });
  const mk = async (origin: string, destination: string, adult: number, ymd: string) => {
    const schedule = await prisma.schedule.create({
      data: {
        boatId: boat.id,
        originPort: origin,
        destinationPort: destination,
        departureTime: '09:00',
        durationMinutes: 45,
        basePrice: adult,
        daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
        status: 'ACTIVE',
        fareMatrix: matrix(adult),
      },
    });
    await prisma.leg.create({
      data: {
        scheduleId: schedule.id,
        operatorId: boat.operatorId,
        departureDate: new Date(`${ymd}T01:00:00Z`),
        basePrice: adult,
        status: 'OPEN',
      },
    });
  };
  await mk(A, B, 150_000, OUT_DATE);
  await mk(B, A, 200_000, RET_DATE);
});

test.afterAll(async () => {
  await removeBookings(prisma, { customerEmail: EMAIL });
  await removeSchedules(prisma, [A, B]);
  await prisma.$disconnect();
});

test('customer books a round trip, sees each leg priced, and pays on the mock checkout', async ({ page }) => {
  await page.goto(
    `/search?origin=${encodeURIComponent(A)}&destination=${encodeURIComponent(B)}` +
      `&date=${OUT_DATE}&returnDate=${RET_DATE}&passengers=2`,
  );
  await expect(page.getByRole('heading', { name: 'Outbound' })).toBeVisible({ timeout: 15_000 });

  const pick = (heading: string) =>
    page.getByRole('heading', { name: heading }).locator('xpath=following-sibling::*[1]').getByRole('button').first();
  await pick('Outbound').click();
  await pick('Return').click();
  await page.getByRole('link', { name: 'Continue to Booking' }).click();
  await page.waitForURL(/\/book\//, { timeout: 15_000 });

  await page.locator('#passengerName-0').fill('E2E Adult');
  await page.locator('#passengerName-1').fill('E2E Child');
  await page.locator('#passengerType-1').selectOption('CHILD');
  await page.locator('#customerName').fill('E2E Round Trip');
  await page.locator('#customerEmail').fill(EMAIL);
  await page.getByPlaceholder('812 3456 7890').fill('8123456789');
  await page.locator('input[name="agreedToTerms"]').check();

  // Each leg is priced for the passenger mix, and the two add up to the total.
  const row = (label: string, amount: string) =>
    page.locator('div.flex.justify-between').filter({ hasText: label }).filter({ hasText: amount });
  await expect(row('Outbound', 'Rp 225.000').first()).toBeVisible();
  await expect(row('Return', 'Rp 300.000').first()).toBeVisible();
  await expect(row('Total', 'Rp 525.000').first()).toBeVisible();
  if (process.env.QC_SHOTS) await page.screenshot({ path: 'test-results/qc/ROUNDTRIP-book-form.png', fullPage: true });
  const pay = page.getByRole('button', { name: /^Pay\s/ });
  await expect(pay).toContainText('Rp 525.000');
  await pay.click();

  await page.waitForURL((u) => !u.pathname.includes('/book'), { timeout: 30_000 });
  await payInMockMode(page);
  await page.waitForURL(/\/b\/[^/]+/, { timeout: 30_000 });
  await expect(page.locator('body')).toContainText(/confirming your seat/i, { timeout: 15_000 });

  const booking = await prisma.booking.findFirstOrThrow({
    where: { customerEmail: EMAIL },
    include: { payment: true },
  });
  expect(booking.tripType).toBe('ROUND_TRIP');
  expect(booking.legId).toBeNull();
  expect(booking.outboundLegId).not.toBeNull();
  expect(booking.returnLegId).not.toBeNull();
  expect(booking.status).toBe('AWAITING_CONFIRMATION');
  expect(Number(booking.totalAmount)).toBe(525_000);
  expect(booking.payment?.status).toBe('SUCCESSFUL');
  expect(booking.seasonSnapshot).toHaveLength(2);
});
