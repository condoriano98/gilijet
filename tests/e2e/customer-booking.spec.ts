import { test, expect } from '@playwright/test';
import { loadEnvConfig } from '@next/env';
import { PrismaClient } from '@prisma/client';
import { requireMockPayments, payInMockMode } from './support/mock-payments';
import { removeBookings, removeSchedules } from './support/fixtures';

loadEnvConfig(process.cwd());
requireMockPayments();

/**
 * Golden path: an anonymous customer searches a route, picks a departure, fills
 * the guest form, pays on the mock checkout and lands on a booking page saying
 * their seat is being confirmed.
 *
 * Paying does not produce a boarding pass: an admin has to reach the operator
 * first, so there is deliberately no QR code and no ticket yet.
 *
 * It builds its own route in 2094 (the QA schedules only get departures inside
 * the July–August demo window, so a search "7 days ahead" found none for most
 * of the year) and removes it afterwards. `requireMockPayments()` skips the file
 * when a live payment or messaging key is set. Relies on `pnpm seed:qa` (boat).
 */
const prisma = new PrismaClient();

const ORIGIN = 'E2E Cust Origin';
const DESTINATION = 'E2E Cust Dest';
const EMAIL = 'e2e-customer-booking@example.invalid';
const DATE = '2094-06-12';

test.beforeAll(async () => {
  await removeBookings(prisma, { customerEmail: EMAIL });
  await removeSchedules(prisma, [ORIGIN]);
  const boat = await prisma.boat.findUniqueOrThrow({ where: { registrationNumber: 'QA-BOAT-001' } });
  const schedule = await prisma.schedule.create({
    data: {
      boatId: boat.id,
      originPort: ORIGIN,
      destinationPort: DESTINATION,
      departureTime: '09:00',
      durationMinutes: 45,
      basePrice: 120_000,
      daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
      status: 'ACTIVE',
    },
  });
  await prisma.leg.create({
    data: {
      scheduleId: schedule.id,
      operatorId: boat.operatorId,
      departureDate: new Date(`${DATE}T01:00:00Z`),
      basePrice: 120_000,
      status: 'OPEN',
    },
  });
});

test.afterAll(async () => {
  await removeBookings(prisma, { customerEmail: EMAIL });
  await removeSchedules(prisma, [ORIGIN]);
  await prisma.$disconnect();
});

test('anonymous customer can book a departure end-to-end', async ({ page }) => {
  await page.goto(
    `/search?origin=${encodeURIComponent(ORIGIN)}&destination=${encodeURIComponent(DESTINATION)}&date=${DATE}&passengers=1`,
  );
  await page.getByRole('link', { name: /^Book 1/ }).click({ timeout: 15_000 });
  await page.waitForURL(/\/book\//, { timeout: 15_000 });

  await page.locator('#passengerName-0').fill('E2E Passenger');
  await page.locator('#customerName').fill('E2E Customer');
  await page.locator('#customerEmail').fill(EMAIL);
  await page.getByPlaceholder('812 3456 7890').fill('8123456789');
  await page.locator('input[name="agreedToTerms"]').check();
  await page.getByRole('button', { name: /^Pay\s/ }).click();

  await page.waitForURL((u) => !u.pathname.includes('/book'), { timeout: 30_000 });
  await payInMockMode(page);
  await page.waitForURL(/\/b\/[^/]+/, { timeout: 30_000 });

  await expect(page.locator('body')).toContainText(/confirming your seat/i, { timeout: 15_000 });
  // The boarding pass comes from an admin confirming with the operator, not from payment.
  await expect(page.getByAltText(/QR code for ticket/i)).toHaveCount(0);

  const booking = await prisma.booking.findFirstOrThrow({
    where: { customerEmail: EMAIL },
    include: { payment: true, tickets: true },
  });
  expect(booking.status).toBe('AWAITING_CONFIRMATION');
  expect(Number(booking.totalAmount)).toBe(120_000);
  expect(booking.payment?.status).toBe('SUCCESSFUL');
  expect(booking.tickets).toHaveLength(0);
});
