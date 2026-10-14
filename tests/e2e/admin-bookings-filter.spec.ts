import { test, expect } from '@playwright/test';
import { loadEnvConfig } from '@next/env';
import { PrismaClient } from '@prisma/client';
import { removeBookings, removeSchedules } from './support/fixtures';

loadEnvConfig(process.cwd());

/**
 * Admin bookings list: the Trip Type filter, that the other filters survive
 * clicking it, and that the CSV export is exactly what the screen shows (it
 * used to ignore the payment-method filter).
 *
 * Own one-way and round-trip bookings in 2091, removed afterwards. Relies on
 * `pnpm seed:qa` (boat and admin account).
 */
const prisma = new PrismaClient();

const ORIGIN = 'E2E Filter Origin';
const ONE_WAY = 'E2E-FILTER-OW';
const ROUND_TRIP = 'E2E-FILTER-RT';

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  await removeBookings(prisma, { bookingReference: { in: [ONE_WAY, ROUND_TRIP] } });
  await removeSchedules(prisma, [ORIGIN]);
  const boat = await prisma.boat.findUniqueOrThrow({ where: { registrationNumber: 'QA-BOAT-001' } });
  const schedule = await prisma.schedule.create({
    data: {
      boatId: boat.id,
      originPort: ORIGIN,
      destinationPort: 'E2E Filter Dest',
      departureTime: '09:00',
      durationMinutes: 45,
      basePrice: 100_000,
      daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
      status: 'ACTIVE',
    },
  });
  const leg = (ymd: string) =>
    prisma.leg.create({
      data: {
        scheduleId: schedule.id,
        operatorId: boat.operatorId,
        departureDate: new Date(`${ymd}T01:00:00Z`),
        basePrice: 100_000,
        status: 'OPEN',
      },
    });
  const [out, ret] = [await leg('2091-06-12'), await leg('2091-06-14')];
  const common = {
    operatorId: boat.operatorId,
    customerName: 'E2E Filter Customer',
    customerEmail: 'e2e-filter@example.invalid',
    customerPhone: '+620000000000',
    commissionAmount: 8_000,
    operatorAmount: 92_000,
    status: 'CONFIRMED' as const,
    refundDeadline: new Date('2091-06-05T00:00:00Z'),
  };
  await prisma.booking.create({
    data: {
      ...common,
      bookingReference: ONE_WAY,
      legId: out.id,
      totalAmount: 100_000,
      payment: { create: { amount: 100_000, method: 'BANK_TRANSFER', status: 'SUCCESSFUL' } },
    },
  });
  await prisma.booking.create({
    data: {
      ...common,
      bookingReference: ROUND_TRIP,
      tripType: 'ROUND_TRIP',
      outboundLegId: out.id,
      returnLegId: ret.id,
      totalAmount: 200_000,
      payment: { create: { amount: 200_000, method: 'PAYPAL', status: 'SUCCESSFUL' } },
    },
  });
});

test.afterAll(async () => {
  await removeBookings(prisma, { bookingReference: { in: [ONE_WAY, ROUND_TRIP] } });
  await removeSchedules(prisma, [ORIGIN]);
  await prisma.$disconnect();
});

test('the Trip Type filter narrows the list and keeps the other filters', async ({ page }) => {
  await page.goto('/admin/login');
  await page.getByLabel(/email/i).fill('qa-admin@gilifast.local');
  await page.getByLabel(/password/i).fill('qaqaqaqa');
  await page.getByRole('button', { name: /log ?in|sign ?in/i }).click();
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 20_000 });

  await page.goto('/admin/bookings?q=E2E-FILTER');
  const body = page.locator('body');
  await expect(body).toContainText(ONE_WAY, { timeout: 15_000 });
  await expect(body).toContainText(ROUND_TRIP);

  await page.getByRole('link', { name: 'Round trip', exact: true }).click();
  await expect(page).toHaveURL(/tripType=ROUND_TRIP/);
  await expect(page).toHaveURL(/q=E2E-FILTER/);
  await expect(body).toContainText(ROUND_TRIP);
  await expect(body).not.toContainText(ONE_WAY);

  // Another filter chip keeps the trip type instead of dropping it.
  await page.getByRole('link', { name: 'PayPal', exact: true }).click();
  await expect(page).toHaveURL(/tripType=ROUND_TRIP/);
  await expect(page).toHaveURL(/paymentMethod=PAYPAL/);
  await expect(body).toContainText(ROUND_TRIP);

  await page.getByRole('link', { name: 'One way', exact: true }).click();
  await expect(page).toHaveURL(/tripType=ONE_WAY/);
  await expect(body).not.toContainText(ROUND_TRIP); // a PayPal one-way booking does not exist
});

test('the CSV export contains exactly what the filters select', async ({ page }) => {
  await page.goto('/admin/login');
  await page.getByLabel(/email/i).fill('qa-admin@gilifast.local');
  await page.getByLabel(/password/i).fill('qaqaqaqa');
  await page.getByRole('button', { name: /log ?in|sign ?in/i }).click();
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 20_000 });

  const csv = async (query: string) => {
    const res = await page.request.get(`/api/admin/bookings/csv?q=E2E-FILTER${query}`);
    expect(res.status()).toBe(200);
    return res.text();
  };

  const all = await csv('');
  expect(all).toContain(ONE_WAY);
  expect(all).toContain(ROUND_TRIP);

  const roundTrips = await csv('&tripType=ROUND_TRIP');
  expect(roundTrips).toContain(ROUND_TRIP);
  expect(roundTrips).not.toContain(ONE_WAY);

  // Used to be ignored: the export was wider than the screen.
  const bankTransfer = await csv('&paymentMethod=BANK_TRANSFER');
  expect(bankTransfer).toContain(ONE_WAY);
  expect(bankTransfer).not.toContain(ROUND_TRIP);

  const none = await csv('&tripType=ROUND_TRIP&paymentMethod=BANK_TRANSFER');
  expect(none).not.toContain(ONE_WAY);
  expect(none).not.toContain(ROUND_TRIP);
});
