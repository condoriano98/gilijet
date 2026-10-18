import { test, expect } from '@playwright/test';
import { loadEnvConfig } from '@next/env';
import { PrismaClient } from '@prisma/client';
import { requireMockPayments, payInMockMode } from './support/mock-payments';
import { removeBookings, removeSchedules } from './support/fixtures';

loadEnvConfig(process.cwd());
requireMockPayments();

/**
 * E-ticket Part A: paying a booking sends the operator's PICs the "order paid"
 * message and records it in the audit log.
 *
 * Messaging keys are blanked (requireMockPayments), so the WATI template is only
 * logged; what is asserted is the `pic_order_notified` audit row with the number
 * of recipients, and that the booking itself is untouched (still waiting for the
 * admin to confirm with the operator).
 *
 * Builds its own route (2095) and its own OperatorPicContact row, and removes
 * them afterwards. The dev server needs PIC_ORDER_TEMPLATE set, otherwise the
 * notification is skipped by design and the spec skips itself.
 * Relies on `pnpm seed:qa` (boat).
 */
const prisma = new PrismaClient();

const ORIGIN = 'E2E Pic Origin';
const DESTINATION = 'E2E Pic Dest';
const EMAIL = 'e2e-eticket-pic@example.invalid';
const PIC_PHONE = '+62 800 0000 0412';
const DATE = '2095-06-12';

test.skip(!process.env.PIC_ORDER_TEMPLATE?.trim(), 'PIC_ORDER_TEMPLATE is not set');

async function cleanup() {
  const bookings = await prisma.booking.findMany({ where: { customerEmail: EMAIL }, select: { id: true } });
  await prisma.auditLog.deleteMany({ where: { entityId: { in: bookings.map((b) => b.id) } } });
  await removeBookings(prisma, { customerEmail: EMAIL });
  await removeSchedules(prisma, [ORIGIN]);
  await prisma.operatorPicContact.deleteMany({ where: { nohpNotifikasi: PIC_PHONE } });
}

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
  await prisma.operatorPicContact.create({
    data: { operatorId: boat.operatorId, nohpNotifikasi: PIC_PHONE },
  });
});

test.afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

test('paying a booking notifies the operator PICs', async ({ page }) => {
  await page.goto(
    `/search?origin=${encodeURIComponent(ORIGIN)}&destination=${encodeURIComponent(DESTINATION)}&date=${DATE}&passengers=1`,
  );
  await page.getByRole('link', { name: /^Book 1/ }).click({ timeout: 15_000 });
  await page.waitForURL(/\/book\//, { timeout: 15_000 });

  await page.locator('#passengerName-0').fill('E2E Pic Passenger');
  await page.locator('#customerName').fill('E2E Pic Customer');
  await page.locator('#customerEmail').fill(EMAIL);
  await page.getByPlaceholder('812 3456 7890').fill('8123456789');
  await page.locator('input[name="agreedToTerms"]').check();
  await page.getByRole('button', { name: /^Pay\s/ }).click();

  await page.waitForURL((u) => !u.pathname.includes('/book'), { timeout: 30_000 });
  await payInMockMode(page);
  await page.waitForURL(/\/b\/[^/]+/, { timeout: 30_000 });

  const booking = await prisma.booking.findFirstOrThrow({ where: { customerEmail: EMAIL } });
  // The notification is fire-and-forget after the payment, so wait for its audit row.
  await expect
    .poll(
      () => prisma.auditLog.findFirst({ where: { entityId: booking.id, action: 'pic_order_notified' } }),
      { timeout: 15_000 },
    )
    .not.toBeNull();

  const row = await prisma.auditLog.findFirstOrThrow({
    where: { entityId: booking.id, action: 'pic_order_notified' },
  });
  expect((row.newState as { recipients: number }).recipients).toBeGreaterThanOrEqual(1);

  // Information only: the booking still waits for the admin to confirm.
  const after = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id }, include: { tickets: true } });
  expect(after.status).toBe('AWAITING_CONFIRMATION');
  expect(after.tickets).toHaveLength(0);
});
