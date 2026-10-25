import { test, expect, type Page } from '@playwright/test';
import { loadEnvConfig } from '@next/env';
import { PrismaClient } from '@prisma/client';
import { requireMockPayments } from './support/mock-payments';
import { flatFares, removeBookings, removeSchedules } from './support/fixtures';

loadEnvConfig(process.cwd());
requireMockPayments();

/**
 * Coupons end to end: a Nett coupon through the real booking form (preview,
 * booking row, status page), the coupon coming back when the customer cancels,
 * the route rule agreeing between preview and engine, and the owner console
 * form (Nett option, no cost-bearer field, route and operator dropdowns).
 *
 * It never pays. Own fixtures (a 2095 departure, three coupons), removed
 * afterwards. Relies on `pnpm seed:qa` (QA boat, QA admin).
 */
const prisma = new PrismaClient();

const ORIGIN = 'E2E Coupon Origin';
const DESTINATION = 'E2E Coupon Dest';
const ROUTE = `${ORIGIN}-${DESTINATION}`;
const EMAIL = 'e2e-coupon@example.invalid';
const NETT = 'E2ENETT150';
const OTHER_ROUTE = 'E2EOTHERROUTE';
const FORM_CODE = 'E2EFORMNETT';
const CODES = [NETT, OTHER_ROUTE, FORM_CODE];

let legId: string;

async function cleanup() {
  await removeBookings(prisma, { customerEmail: EMAIL });
  // Redemptions point at bookings and promotions with Restrict, so they go first.
  await prisma.promotionRedemption.deleteMany({ where: { customerEmail: EMAIL } });
  await prisma.promotion.deleteMany({ where: { code: { in: CODES } } });
  await removeSchedules(prisma, [ORIGIN]);
}

async function loginAsAdmin(page: Page) {
  await page.goto('/admin/login');
  await page.getByLabel(/email/i).fill('qa-admin@gilifast.local');
  await page.getByLabel(/password/i).fill('qaqaqaqa');
  await page.getByRole('button', { name: /log ?in|sign ?in/i }).click();
  await page.waitForURL(/\/admin(\/|$)(?!login)/, { timeout: 20_000 });
}

/** Adult + child on the fixture departure, contact details and terms filled. */
async function fillBookingForm(page: Page) {
  await page.goto(`/book/${legId}?passengers=2`);
  await page.locator('#passengerName-0').fill('E2E Adult');
  await page.locator('#passengerName-1').fill('E2E Child');
  await page.locator('#passengerType-1').selectOption('CHILD');
  await page.locator('#customerName').fill('E2E Coupon Booker');
  await page.locator('#customerEmail').fill(EMAIL);
  await page.getByPlaceholder('812 3456 7890').fill('8123456789');
  await page.locator('input[name="agreedToTerms"]').check();
}

async function applyCode(page: Page, code: string) {
  await page.locator('#promoCode').fill(code);
  await page.getByRole('button', { name: /^Apply$/ }).click();
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
      basePrice: 200_000,
      daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
      status: 'ACTIVE',
      // Adult 200k, child 100k, whatever the season.
      fareMatrix: flatFares(200_000),
    },
  });
  const leg = await prisma.leg.create({
    data: {
      scheduleId: schedule.id,
      operatorId: boat.operatorId,
      departureDate: new Date('2095-06-12T01:00:00Z'),
      basePrice: 200_000,
      status: 'OPEN',
    },
  });
  legId = leg.id;

  const common = {
    discountType: 'NET' as const,
    discountValue: 150_000,
    maxUses: 5,
    costBearer: 'PLATFORM' as const,
  };
  await prisma.promotion.createMany({
    data: [
      { code: NETT, ...common, appliesToRouteCodes: [ROUTE] },
      { code: OTHER_ROUTE, ...common, appliesToRouteCodes: ['Somewhere-Else'] },
    ],
  });
});

test.afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

test('Nett coupon: the preview, the booking and the status page agree', async ({ page }) => {
  await fillBookingForm(page);
  await applyCode(page, NETT);
  // Fare 200k + 100k = 300k; Nett 150k + 75k = 225k; saving 75k.
  await expect(page.locator('body')).toContainText('saves', { timeout: 15_000 });
  await expect(page.locator('body')).toContainText('Rp 75.000');

  await page.getByRole('button', { name: /^Pay\s/ }).click();
  await page.waitForURL((u) => !u.pathname.includes('/book'), { timeout: 30_000 });

  const booking = await prisma.booking.findFirstOrThrow({
    where: { customerEmail: EMAIL, legId },
    include: { promotion: true, promotionRedemption: true },
  });
  expect(booking.status).toBe('PENDING_PAYMENT');
  expect(Number(booking.totalAmount)).toBe(225_000);
  expect(Number(booking.discountAmount)).toBe(75_000);
  expect(booking.promotion?.code).toBe(NETT);
  expect(Number(booking.promotionRedemption!.amount)).toBe(75_000);
  expect(booking.promotion?.usedCount).toBe(1);

  await page.goto(`/b/${booking.bookingReference}`);
  await expect(page.locator('body')).toContainText(`Promo ${NETT}`, { timeout: 15_000 });
  await expect(page.locator('body')).toContainText('-Rp 75.000');
  await expect(page.locator('body')).toContainText('Rp 225.000');
});

test('cancelling the booking gives the coupon back', async ({ page }) => {
  const booking = await prisma.booking.findFirstOrThrow({
    where: { customerEmail: EMAIL, legId, status: 'PENDING_PAYMENT' },
  });

  await page.goto(`/b/${booking.bookingReference}`);
  await page.locator('input[name="confirmEmail"]').fill(EMAIL);
  await page.getByRole('button', { name: 'Cancel booking' }).click();
  await expect(page.locator('body')).toContainText(/cancelled/i, { timeout: 15_000 });

  const after = await prisma.booking.findUniqueOrThrow({
    where: { id: booking.id },
    include: { promotionRedemption: true },
  });
  expect(after.status).toBe('CANCELLED_BY_CUSTOMER');
  expect(after.promotionRedemption).toBeNull();
  const promo = await prisma.promotion.findUniqueOrThrow({ where: { code: NETT } });
  expect(promo.usedCount).toBe(0);
  expect(Number(promo.budgetSpent)).toBe(0);
  // The booking keeps the discount it was made with, as history.
  expect(Number(after.discountAmount)).toBe(75_000);
});

test('the preview refuses a coupon for another route, as the booking would', async ({ page }) => {
  await fillBookingForm(page);
  await applyCode(page, OTHER_ROUTE);
  await expect(page.locator('body')).toContainText('not valid for this route', { timeout: 15_000 });
});

test.describe('owner console form', () => {
  test('offers Nett, no cost bearer, and route and operator dropdowns with All', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/console/coupons/new');

    await expect(page.locator('#discountType option[value="NET"]')).toHaveText(/Nett/);
    await expect(page.locator('body')).not.toContainText('Who absorbs the discount');

    // Both start on All, so "no restriction" is a visible answer.
    await expect(page.locator('#appliesToRouteCodes')).toContainText('All routes');
    await expect(page.locator('#appliesToOperatorIds')).toContainText('All operators');

    await page.locator('#appliesToRouteCodes').click();
    await expect(page.getByRole('checkbox', { name: 'All routes' })).toBeChecked();
    await expect(page.getByText(`${ORIGIN} → ${DESTINATION}`)).toBeVisible();
  });

  test('saves the picked route and the Nett type, paid for by the platform', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/console/coupons/new');

    await page.locator('#code').fill(FORM_CODE);
    await page.locator('#discountType').selectOption('NET');
    await page.locator('#discountValue').fill('175000');
    await page.locator('#maxUses').fill('10');

    await page.locator('#appliesToRouteCodes').click();
    await page.getByText(`${ORIGIN} → ${DESTINATION}`).click();
    await expect(page.locator('#appliesToRouteCodes')).toContainText(`${ORIGIN} → ${DESTINATION}`);
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Create coupon' }).click();
    await page.waitForURL(/\/admin\/console\/coupons$/, { timeout: 20_000 });

    const saved = await prisma.promotion.findUniqueOrThrow({ where: { code: FORM_CODE } });
    expect(saved.discountType).toBe('NET');
    expect(Number(saved.discountValue)).toBe(175_000);
    expect(saved.costBearer).toBe('PLATFORM');
    expect(saved.appliesToRouteCodes).toEqual([ROUTE]);
    expect(saved.appliesToOperatorIds).toEqual([]);
  });
});
