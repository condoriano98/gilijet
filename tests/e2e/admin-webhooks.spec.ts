import { test, expect } from '@playwright/test';
import { loadEnvConfig } from '@next/env';
import { PrismaClient } from '@prisma/client';
import { removeBookings, removeSchedules } from './support/fixtures';

loadEnvConfig(process.cwd());

/**
 * Admin payment-webhook log and the booking status label.
 *
 * Builds its own WebhookEvent rows and one paid booking (year 2090) and removes
 * them afterwards. A signed DOKU callback cannot be sent from here (without keys
 * the endpoint fails closed with 401), so the processors are covered by unit
 * tests and this spec covers what an admin sees and can do.
 * Relies on `pnpm seed:qa` (boat and admin account).
 */
const prisma = new PrismaClient();

const ORIGIN = 'E2E Webhook Origin';
const PAID = 'BK-2090-06-WHKPD1';
const RETRY_REF = 'BK-2090-06-WHKRT1';
const REJECTED_REF = 'BK-2090-06-WHKRJ1';
const REFS = [PAID, RETRY_REF, REJECTED_REF];

test.describe.configure({ mode: 'serial' });

async function cleanup() {
  await prisma.webhookEvent.deleteMany({ where: { externalRef: { in: REFS } } });
  await removeBookings(prisma, { bookingReference: PAID });
  await removeSchedules(prisma, [ORIGIN]);
}

test.beforeAll(async () => {
  await cleanup();
  const boat = await prisma.boat.findUniqueOrThrow({ where: { registrationNumber: 'QA-BOAT-001' } });
  const schedule = await prisma.schedule.create({
    data: {
      boatId: boat.id,
      originPort: ORIGIN,
      destinationPort: 'E2E Webhook Dest',
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
      departureDate: new Date('2090-06-12T01:00:00Z'),
      basePrice: 100_000,
      status: 'OPEN',
    },
  });
  await prisma.booking.create({
    data: {
      operatorId: boat.operatorId,
      bookingReference: PAID,
      legId: leg.id,
      customerName: 'E2E Webhook Customer',
      customerEmail: 'e2e-webhook@example.invalid',
      customerPhone: '+620000000000',
      totalAmount: 100_000,
      commissionAmount: 8_000,
      operatorAmount: 92_000,
      status: 'AWAITING_CONFIRMATION',
      refundDeadline: new Date('2090-06-05T00:00:00Z'),
      payment: { create: { amount: 100_000, method: 'BANK_TRANSFER', status: 'SUCCESSFUL' } },
    },
  });
  // A payment.success for a booking that does not exist: retrying it ends
  // SKIPPED without touching any booking or sending any message.
  await prisma.webhookEvent.create({
    data: {
      provider: 'doku',
      eventType: 'payment.success',
      externalRef: RETRY_REF,
      rawPayload: {
        order: { invoice_number: RETRY_REF, amount: 100000 },
        transaction: { status: 'SUCCESS' },
      },
      status: 'FAILED',
      attempts: 1,
      lastAttemptAt: new Date(),
      errorMessage: 'E2E simulated failure',
    },
  });
  await prisma.webhookEvent.create({
    data: {
      provider: 'doku',
      eventType: 'signature.rejected',
      externalRef: REJECTED_REF,
      rawPayload: { body: '{}', truncated: false },
      status: 'FAILED',
      attempts: 1,
      lastAttemptAt: new Date(),
      errorMessage: 'Invalid signature',
    },
  });
});

test.afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

async function login(page: import('@playwright/test').Page) {
  await page.goto('/admin/login');
  await page.getByLabel(/email/i).fill('qa-admin@gilifast.local');
  await page.getByLabel(/password/i).fill('qaqaqaqa');
  await page.getByRole('button', { name: /log ?in|sign ?in/i }).click();
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 20_000 });
}

test('a paid booking is labelled as paid in the admin bookings list', async ({ page }) => {
  await login(page);
  await page.goto(`/admin/bookings?q=${PAID}`);
  const body = page.locator('body');
  await expect(body).toContainText(PAID, { timeout: 15_000 });
  await expect(body).toContainText('Paid · awaiting confirmation');
  await expect(body).not.toContainText('AWAITING CONFIRMATION');
});

test('the webhook log lists events, filters them and retries a failed one', async ({ page }) => {
  await login(page);
  await page.goto(`/admin/webhooks?q=BK-2090-06-WHK`);
  const body = page.locator('body');
  await expect(body).toContainText(RETRY_REF, { timeout: 15_000 });
  await expect(body).toContainText('E2E simulated failure');
  // Unauthenticated, rejected callbacks live on their own tab.
  await expect(body).not.toContainText(REJECTED_REF);

  await page.goto(`/admin/webhooks?q=BK-2090-06-WHK&type=rejected`);
  await expect(body).toContainText(REJECTED_REF, { timeout: 15_000 });
  await expect(body).toContainText('Invalid signature');
  await expect(body).not.toContainText(RETRY_REF);
  await page.goto(`/admin/webhooks?q=BK-2090-06-WHK`);

  // Only the event a handler exists for offers Retry.
  await expect(page.getByRole('button', { name: 'Retry' })).toHaveCount(1);

  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(page).toHaveURL(/ok=retried/);
  await expect(page.getByRole('status')).toContainText('Event processed');

  const row = await prisma.webhookEvent.findFirstOrThrow({
    where: { externalRef: RETRY_REF },
  });
  expect(row.status).toBe('SKIPPED');
  expect(row.attempts).toBe(2);

  // Filtering by status keeps the rest of the filters.
  await page.goto(`/admin/webhooks?q=BK-2090-06-WHK&status=SKIPPED`);
  await expect(body).toContainText(RETRY_REF);
  await expect(body).not.toContainText(REJECTED_REF);
});

test('the bookings list picks up a status change without a reload', async ({ page }) => {
  await page.clock.install();
  await login(page);
  await page.goto(`/admin/bookings?q=${PAID}`);
  const row = page.getByRole('row').filter({ hasText: PAID });
  await expect(row).toContainText('Paid · awaiting confirmation', { timeout: 15_000 });

  await prisma.booking.update({ where: { bookingReference: PAID }, data: { status: 'CONFIRMED' } });
  await page.clock.fastForward(31_000);

  await expect(row).toContainText('Confirmed', { timeout: 15_000 });
  await expect(row).not.toContainText('awaiting confirmation');
});
