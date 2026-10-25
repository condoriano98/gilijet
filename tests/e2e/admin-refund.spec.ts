import { test, expect } from '@playwright/test';
import { loadEnvConfig } from '@next/env';
import { PrismaClient } from '@prisma/client';
import { removeBookings, removeSchedules } from './support/fixtures';

loadEnvConfig(process.cwd());

/**
 * An admin signs in and finds a pending refund in the queue. Builds its own
 * booking and refund in 2092 instead of relying on the seeded one, which other
 * runs may already have approved, and removes them afterwards. Viewing the
 * queue changes nothing: approving is a separate server action. Relies on
 * `pnpm seed:qa` (boat and admin account).
 */
const prisma = new PrismaClient();

const ORIGIN = 'E2E Refund Origin';
const REFERENCE = 'E2E-REFUND-01';
let refundId: string;

test.beforeAll(async () => {
  await removeBookings(prisma, { bookingReference: REFERENCE });
  await removeSchedules(prisma, [ORIGIN]);
  const boat = await prisma.boat.findUniqueOrThrow({ where: { registrationNumber: 'QA-BOAT-001' } });
  const schedule = await prisma.schedule.create({
    data: {
      boatId: boat.id,
      originPort: ORIGIN,
      destinationPort: 'E2E Refund Dest',
      departureTime: '09:00',
      durationMinutes: 45,
      basePrice: 100_000,
      daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
      status: 'ACTIVE',
    },
  });
  const leg = await prisma.leg.create({
    data: {
      scheduleId: schedule.id,
      operatorId: boat.operatorId,
      departureDate: new Date('2092-06-12T01:00:00Z'),
      basePrice: 100_000,
      status: 'OPEN',
    },
  });
  const booking = await prisma.booking.create({
    data: {
      bookingReference: REFERENCE,
      legId: leg.id,
      operatorId: boat.operatorId,
      customerName: 'E2E Refund Customer',
      customerEmail: 'e2e-refund@example.invalid',
      customerPhone: '+620000000000',
      totalAmount: 100_000,
      commissionAmount: 8_000,
      operatorAmount: 92_000,
      status: 'CANCELLED_BY_CUSTOMER',
      refundDeadline: new Date('2092-06-05T00:00:00Z'),
    },
  });
  const refund = await prisma.refund.create({
    data: {
      bookingId: booking.id,
      originalAmount: 100_000,
      refundAmount: 100_000,
      reason: 'CUSTOMER_REQUEST',
      status: 'PENDING',
    },
  });
  refundId = refund.id;
});

test.afterAll(async () => {
  await removeBookings(prisma, { bookingReference: REFERENCE });
  await removeSchedules(prisma, [ORIGIN]);
  await prisma.$disconnect();
});

test('admin can sign in and find a pending refund in the queue', async ({ page }) => {
  await page.goto('/admin/login');
  await page.getByLabel(/email/i).fill('qa-admin@gilifast.local');
  await page.getByLabel(/password/i).fill('qaqaqaqa');
  await page.getByRole('button', { name: /log ?in|sign ?in/i }).click();
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 20_000 });

  await page.goto('/admin/refunds?filter=pending');
  await expect(page.locator('body')).toContainText('Pending approval', { timeout: 15_000 });
  await expect(page.locator('body')).toContainText(REFERENCE);

  // Looking at the queue must not approve anything.
  expect((await prisma.refund.findUniqueOrThrow({ where: { id: refundId } })).status).toBe('PENDING');
});
