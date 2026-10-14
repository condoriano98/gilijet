import { test, expect } from '@playwright/test';
import { loadEnvConfig } from '@next/env';
import { PrismaClient } from '@prisma/client';

loadEnvConfig(process.cwd());

/**
 * A reschedule request may not target an OFF day. The date picker already hides
 * those departures; this proves the server refuses one that is submitted anyway
 * (a stale page, or a hand-edited form).
 *
 * Own fixtures in 2099, removed afterwards. Relies on `pnpm seed:qa` (QA boat).
 */
const prisma = new PrismaClient();

const ORIGIN = 'E2E Resched Origin';
const DESTINATION = 'E2E Resched Dest';
const REFERENCE = 'E2E-RESCHED-01';
const EMAIL = 'e2e-resched@example.invalid';
const SEASON_IDS = ['e2e-resched-high', 'e2e-resched-off'];

let originalLegId: string;
let openLegId: string;
let offLegId: string;

async function cleanup() {
  const schedules = await prisma.schedule.findMany({
    where: { originPort: ORIGIN, destinationPort: DESTINATION },
    select: { id: true },
  });
  const ids = schedules.map((s) => s.id);
  const booking = await prisma.booking.findUnique({ where: { bookingReference: REFERENCE }, select: { id: true } });
  if (booking) {
    await prisma.rescheduleRequest.deleteMany({ where: { bookingId: booking.id } });
    await prisma.booking.delete({ where: { id: booking.id } });
  }
  await prisma.leg.deleteMany({ where: { scheduleId: { in: ids } } });
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
    },
  });
  await prisma.season.createMany({
    data: [
      { id: SEASON_IDS[0], type: 'LOW', startDate: new Date('2099-06-01T00:00:00Z'), endDate: new Date('2099-06-30T00:00:00Z') },
      { id: SEASON_IDS[1], type: 'OFF', startDate: new Date('2099-06-15T00:00:00Z'), endDate: new Date('2099-06-15T00:00:00Z') },
    ],
  });
  const mk = (ymd: string) =>
    prisma.leg.create({
      data: {
        scheduleId: schedule.id,
        operatorId: boat.operatorId,
        departureDate: new Date(`${ymd}T01:00:00Z`),
        basePrice: 100_000,
        status: 'OPEN',
      },
    });
  originalLegId = (await mk('2099-06-11')).id;
  openLegId = (await mk('2099-06-12')).id;
  offLegId = (await mk('2099-06-15')).id;

  await prisma.booking.create({
    data: {
      bookingReference: REFERENCE,
      legId: originalLegId,
      operatorId: boat.operatorId,
      customerName: 'E2E Tester',
      customerEmail: EMAIL,
      customerPhone: '+620000000000',
      totalAmount: 100_000,
      commissionAmount: 8_000,
      operatorAmount: 92_000,
      status: 'CONFIRMED',
      refundDeadline: new Date('2099-06-10T00:00:00Z'),
    },
  });
});

test.afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

const page_ = (ymd: string) => `/b/${REFERENCE}/reschedule?date=${ymd}`;

test('the date picker lists an open day and hides the OFF day', async ({ page }) => {
  await page.goto(page_('2099-06-12'));
  await expect(page.getByRole('button', { name: 'Request this' })).toBeVisible({ timeout: 15_000 });
  await page.goto(page_('2099-06-15'));
  await expect(page.locator('body')).toContainText(/No departures on this date/i, { timeout: 15_000 });
});

test('a request for an OFF-day departure is refused by the server', async ({ page }) => {
  await page.goto(page_('2099-06-12'));
  const form = page.locator('form').filter({ has: page.getByRole('button', { name: 'Request this' }) }).first();
  await expect(form).toBeVisible({ timeout: 15_000 });
  // Swap in the OFF leg, as a stale page or a hand-edited form would.
  await form.locator('input[name="requestedLegId"]').evaluate((el, id) => ((el as HTMLInputElement).value = id), offLegId);
  await form.locator('input[name="confirmEmail"]').fill(EMAIL);
  await form.getByRole('button', { name: 'Request this' }).click();

  await expect(page).toHaveURL(/error=Selected%20departure%20is%20unavailable/, { timeout: 15_000 });
  expect(await prisma.rescheduleRequest.count({ where: { booking: { bookingReference: REFERENCE } } })).toBe(0);
});

test('a request for an open departure still goes through', async ({ page }) => {
  await page.goto(page_('2099-06-12'));
  const form = page.locator('form').filter({ has: page.getByRole('button', { name: 'Request this' }) }).first();
  await form.locator('input[name="confirmEmail"]').fill(EMAIL);
  await form.getByRole('button', { name: 'Request this' }).click();

  await expect(page).toHaveURL(/ok=reschedule_requested/, { timeout: 15_000 });
  const request = await prisma.rescheduleRequest.findFirstOrThrow({ where: { booking: { bookingReference: REFERENCE } } });
  expect(request.requestedLegId).toBe(openLegId);
  expect(request.status).toBe('PENDING');
});
