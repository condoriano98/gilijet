import { test, expect, type Page } from '@playwright/test';
import { loadEnvConfig } from '@next/env';
import { PrismaClient } from '@prisma/client';
import { requireMockPayments } from './support/mock-payments';
import { removeBookings, removeSchedules, flatFares } from './support/fixtures';
import { createCustomer, loginViaUi, removeCustomers } from './support/customers';

loadEnvConfig(process.cwd());
requireMockPayments();

/**
 * The booking form beyond the guest one-way basics: a signed-in customer's
 * prefill (BOOK-G04), the same server checks on the round-trip form (BOOK-G05)
 * and a valid or expired promo code (BOOK-G06). Cases that submit a valid form
 * stop at the mock checkout: nothing is paid. `requireMockPayments()` skips the
 * file when a live gateway key is set.
 *
 * Own routes in 2088 (fare Rp 100.000 adult in every season; a round-trip leg is
 * half of that) and one promotion, all removed afterwards. Relies on
 * `pnpm seed:qa` (QA boat).
 */
const prisma = new PrismaClient();

const ONE_FROM = 'E2E FormX Origin';
const ONE_TO = 'E2E FormX Dest';
const RT_A = 'E2E FormX RtA';
const RT_B = 'E2E FormX RtB';
const CUSTOMER_EMAIL = 'e2e-form-extras-customer@example.invalid';
const CUSTOMER_NAME = 'E2E Prefill Customer';
const CUSTOMER_PHONE = '+6281234567890';
const GUEST_EMAIL = 'e2e-form-extras-guest@example.invalid';
const PROMO = 'E2EPROMO10';
const EXPIRED_PROMO = 'E2EPROMOOLD';

let oneLegId = '';
let rtOutLegId = '';
let rtRetLegId = '';

test.describe.configure({ mode: 'serial' });

async function cleanup() {
  // Order matters: a redemption blocks deleting its booking, a booking blocks deleting its promotion.
  await prisma.promotionRedemption.deleteMany({ where: { promotion: { code: { in: [PROMO, EXPIRED_PROMO] } } } });
  await removeCustomers(prisma, [CUSTOMER_EMAIL]);
  await removeBookings(prisma, { customerEmail: GUEST_EMAIL });
  await prisma.promotion.deleteMany({ where: { code: { in: [PROMO, EXPIRED_PROMO] } } });
  await removeSchedules(prisma, [ONE_FROM, RT_A, RT_B]);
}

test.beforeAll(async () => {
  await cleanup();
  const boat = await prisma.boat.findUniqueOrThrow({ where: { registrationNumber: 'QA-BOAT-001' } });
  const mk = async (origin: string, destination: string, ymd: string) => {
    const schedule = await prisma.schedule.create({
      data: {
        boatId: boat.id,
        originPort: origin,
        destinationPort: destination,
        departureTime: '09:00',
        durationMinutes: 45,
        basePrice: 100_000,
        daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
        status: 'ACTIVE',
        fareMatrix: flatFares(100_000),
      },
    });
    return prisma.leg.create({
      data: {
        scheduleId: schedule.id,
        operatorId: boat.operatorId,
        departureDate: new Date(`${ymd}T01:00:00Z`),
        basePrice: 100_000,
        status: 'OPEN',
      },
    });
  };
  oneLegId = (await mk(ONE_FROM, ONE_TO, '2088-08-12')).id;
  rtOutLegId = (await mk(RT_A, RT_B, '2088-08-14')).id;
  rtRetLegId = (await mk(RT_B, RT_A, '2088-08-16')).id;

  await createCustomer(prisma, {
    email: CUSTOMER_EMAIL,
    fullName: CUSTOMER_NAME,
    phoneNumber: CUSTOMER_PHONE,
    nationality: 'Indonesia',
  });
  await prisma.promotion.create({
    data: { code: PROMO, discountType: 'PERCENT', discountValue: 10, description: 'E2E ten percent', isActive: true },
  });
  await prisma.promotion.create({
    data: {
      code: EXPIRED_PROMO,
      discountType: 'PERCENT',
      discountValue: 10,
      isActive: true,
      expiresAt: new Date('2001-01-01T00:00:00Z'),
    },
  });
});

test.afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

const payButton = (page: Page) => page.getByRole('button', { name: /^Pay\s/ });
const rtUrl = (extra = '') => `/book/0?outboundLegId=${rtOutLegId}&returnLegId=${rtRetLegId}&passengers=1${extra}`;

/** Fill every field with valid values; individual cases then break one of them. */
async function fillValid(page: Page, o: { passenger?: string; email?: string; phone?: string; terms?: boolean } = {}) {
  await page.locator('#passengerName-0').fill(o.passenger ?? 'E2E Passenger');
  await page.locator('#customerName').fill('E2E Form Customer');
  await page.locator('#customerEmail').fill(o.email ?? GUEST_EMAIL);
  await page.getByPlaceholder('812 3456 7890').fill(o.phone ?? '8123456789');
  if (o.terms !== false) await page.locator('input[name="agreedToTerms"]').check();
}

/** Turn off the browser's own required/email checks so the server's are what answer. */
async function skipBrowserValidation(page: Page) {
  await page
    .locator('form')
    .filter({ has: page.locator('#customerName') })
    .evaluate((f) => ((f as HTMLFormElement).noValidate = true));
}

const guestBookings = () => prisma.booking.count({ where: { customerEmail: GUEST_EMAIL } });

test('BOOK-G04 a signed-in customer finds the form filled in, and the booking is linked to the account', async ({ page }) => {
  await loginViaUi(page, CUSTOMER_EMAIL);
  await page.goto(`/book/${oneLegId}?passengers=1`);

  const note = page.getByText(/Booking as/).first();
  await expect(note).toBeVisible({ timeout: 15_000 });
  await expect(note).toContainText(CUSTOMER_NAME);
  await expect(note).toContainText(CUSTOMER_EMAIL);
  await expect(page.getByText(/Booking as a guest/)).toHaveCount(0);
  await expect(page.locator('#customerName')).toHaveValue(CUSTOMER_NAME);
  await expect(page.locator('#customerEmail')).toHaveValue(CUSTOMER_EMAIL);
  await expect(page.getByPlaceholder('812 3456 7890')).toHaveValue('81234567890');
  await expect(page.locator('input[name="customerPhone"]')).toHaveValue(CUSTOMER_PHONE);
  await expect(page.locator('input[name="customerNationality"]')).toHaveValue('Indonesia');

  // Only the passenger and the terms are left to fill.
  await page.locator('#passengerName-0').fill('E2E Prefill Passenger');
  await page.locator('input[name="agreedToTerms"]').check();
  await payButton(page).click();
  await page.waitForURL(/\/checkout\//, { timeout: 30_000 });

  const customer = await prisma.customer.findUniqueOrThrow({ where: { email: CUSTOMER_EMAIL } });
  const booking = await prisma.booking.findFirstOrThrow({ where: { customerEmail: CUSTOMER_EMAIL } });
  expect(booking.customerId).toBe(customer.id);
  expect(booking.status).toBe('PENDING_PAYMENT');
});

test('BOOK-G05 round-trip form: both legs are shown, and an empty submit is stopped in the browser', async ({ page }) => {
  await page.goto(rtUrl());
  await expect(page.getByRole('heading', { name: `${RT_A} → ${RT_B}` })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('heading', { name: `${RT_B} → ${RT_A}` })).toBeVisible();
  await expect(payButton(page)).toContainText('Rp 100.000');

  await payButton(page).click();
  await expect(page).toHaveURL(/\/book\/0/);
  expect(await page.locator('form :invalid').count()).toBeGreaterThan(0);
  expect(await guestBookings()).toBe(0);
});

test('BOOK-G05b round-trip form: the server refuses missing terms and the redirect keeps both leg ids', async ({ page }) => {
  await page.goto(rtUrl());
  await fillValid(page, { terms: false });
  await skipBrowserValidation(page);
  await payButton(page).click();
  await page.waitForURL(/error=/, { timeout: 15_000 });
  const url = new URL(page.url());
  expect(url.pathname).toMatch(/\/book\/0$/);
  expect(url.searchParams.get('outboundLegId')).toBe(rtOutLegId);
  expect(url.searchParams.get('returnLegId')).toBe(rtRetLegId);
  await expect(page.getByText('Please accept the terms')).toBeVisible();
  // The form is still the round-trip one.
  await expect(page.getByRole('heading', { name: `${RT_B} → ${RT_A}` })).toBeVisible();
  expect(await guestBookings()).toBe(0);
});

test('BOOK-G05c round-trip form: the server refuses an invalid email, a one-letter name and a short phone', async ({ page }) => {
  const cases = [
    { override: { email: 'not-an-email' }, message: /invalid email/i },
    { override: { passenger: 'A' }, message: /Each passenger needs a name/ },
    { override: { phone: '1' }, message: /(String must contain at least 6|too_small|at least 6)/i },
  ];
  for (const c of cases) {
    await page.goto(rtUrl());
    await fillValid(page, c.override);
    await skipBrowserValidation(page);
    await payButton(page).click();
    await page.waitForURL(/error=/, { timeout: 15_000 });
    const url = new URL(page.url());
    expect(url.searchParams.get('outboundLegId'), JSON.stringify(c.override)).toBe(rtOutLegId);
    expect(url.searchParams.get('returnLegId'), JSON.stringify(c.override)).toBe(rtRetLegId);
    await expect(page.getByText(c.message).first()).toBeVisible();
  }
  expect(await guestBookings()).toBe(0);
});

test('BOOK-G06 a valid promo code shows what it saves, and the booking carries the discount', async ({ page }) => {
  await page.goto(`/book/${oneLegId}?passengers=1`);
  await expect(payButton(page)).toContainText('Rp 100.000', { timeout: 15_000 });
  await page.getByLabel('Promo code (optional)').fill(PROMO.toLowerCase());
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByText(/E2E ten percent/)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/saves/i)).toContainText('Rp 10.000');
  await expect(page.getByRole('button', { name: 'Clear' })).toBeVisible();

  await fillValid(page);
  await payButton(page).click();
  await page.waitForURL(/\/checkout\//, { timeout: 30_000 });

  const booking = await prisma.booking.findFirstOrThrow({ where: { customerEmail: GUEST_EMAIL } });
  expect(Number(booking.discountAmount)).toBe(10_000);
  expect(Number(booking.totalAmount)).toBe(90_000);
  expect(booking.promotionId).not.toBeNull();
  // The checkout asks for the discounted amount.
  await expect(page.getByText('Rp 90.000').first()).toBeVisible();
  const promo = await prisma.promotion.findUniqueOrThrow({ where: { code: PROMO } });
  expect(promo.usedCount).toBe(1);
});

test('BOOK-G06b after a valid promo the Pay button shows the discounted total', async ({ page }) => {
  // Bug B17 (docs/spikes/in-progress/BUGS_QA_BASELINE_FINDINGS.md): the form says "saves Rp 10.000"
  // but the Pay button keeps the full Rp 100.000 until the checkout shows Rp 90.000.
  // Remove test.fail when the button follows the promo.
  test.fail(true, 'B17: the Pay button keeps the pre-discount total after a valid promo code');
  await page.goto(`/book/${oneLegId}?passengers=1`);
  await expect(payButton(page)).toContainText('Rp 100.000', { timeout: 15_000 });
  await page.getByLabel('Promo code (optional)').fill(PROMO);
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByText(/saves/i)).toContainText('Rp 10.000', { timeout: 15_000 });
  await expect(payButton(page)).toContainText('Rp 90.000', { timeout: 3_000 });
});

test('BOOK-G06c an expired promo code is refused next to the field and the price stays', async ({ page }) => {
  await page.goto(`/book/${oneLegId}?passengers=1`);
  await page.getByLabel('Promo code (optional)').fill(EXPIRED_PROMO);
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByText('Promo code has expired')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/saves/i)).toHaveCount(0);
  await expect(payButton(page)).toContainText('Rp 100.000');
});
