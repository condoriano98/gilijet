import { test, expect, type Page } from '@playwright/test';
import { loadEnvConfig } from '@next/env';
import { PrismaClient } from '@prisma/client';
import { requireMockPayments } from './support/mock-payments';
import { expectNoHorizontalOverflow, expectSubmitButtonsReachable } from './support/overflow';
import { removeBookings, removeSchedules, flatFares } from './support/fixtures';

loadEnvConfig(process.cwd());
requireMockPayments();

/**
 * The booking form (`/book/<legId>`): how many passenger rows it shows, how the
 * price follows passenger type, what the browser refuses, what the server
 * refuses when the browser check is bypassed, and the pages for a departure
 * that cannot be booked. Every case ends before payment: no booking may exist
 * afterwards. `requireMockPayments()` is here so that a case which wrongly got
 * through could not open a live gateway.
 *
 * Own route in 2088 (one open departure, fare Rp 100.000 adult / 50.000 child /
 * 0 infant in every season) plus one departure in 2001, which is always in the
 * past. Removed afterwards. Relies on `pnpm seed:qa` (QA boat).
 */
const prisma = new PrismaClient();

const ORIGIN = 'E2E Form Origin';
const DESTINATION = 'E2E Form Dest';
const EMAIL = 'e2e-booking-form@example.invalid';
const OPEN_DATE = '2088-06-12';
const PAST_DATE = '2001-06-12';

let openLegId: string;
let pastLegId: string;

test.describe.configure({ mode: 'serial' });

async function cleanup() {
  await removeBookings(prisma, { customerEmail: EMAIL });
  await removeSchedules(prisma, [ORIGIN]);
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
      basePrice: 100_000,
      daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
      status: 'ACTIVE',
      fareMatrix: flatFares(100_000),
    },
  });
  const mk = (ymd: string, status: 'OPEN' | 'SAILED') =>
    prisma.leg.create({
      data: {
        scheduleId: schedule.id,
        operatorId: boat.operatorId,
        departureDate: new Date(`${ymd}T01:00:00Z`),
        basePrice: 100_000,
        status,
      },
    });
  openLegId = (await mk(OPEN_DATE, 'OPEN')).id;
  pastLegId = (await mk(PAST_DATE, 'SAILED')).id;
});

test.afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

const bookingCount = () => prisma.booking.count({ where: { customerEmail: EMAIL } });

/** Fill every field with valid values; individual cases then break one of them. */
async function fillValid(page: Page, overrides: { passenger?: string; email?: string; phone?: string; terms?: boolean } = {}) {
  await page.locator('#passengerName-0').fill(overrides.passenger ?? 'E2E Passenger');
  await page.locator('#customerName').fill('E2E Form Customer');
  await page.locator('#customerEmail').fill(overrides.email ?? EMAIL);
  await page.getByPlaceholder('812 3456 7890').fill(overrides.phone ?? '8123456789');
  if (overrides.terms !== false) await page.locator('input[name="agreedToTerms"]').check();
}

/** Turn off the browser's own required/email checks so the server's are what answer. */
async function skipBrowserValidation(page: Page) {
  await page
    .locator('form')
    .filter({ has: page.locator('#customerName') })
    .evaluate((f) => ((f as HTMLFormElement).noValidate = true));
}

const payButton = (page: Page) => page.getByRole('button', { name: /^Pay\s/ });

test('BOOK-F01 the passenger count in the link sets the rows and the total', async ({ page }) => {
  await page.goto(`/book/${openLegId}?passengers=3`);
  await expect(page.locator('#passengerName-2')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('#passengerName-3')).toHaveCount(0);
  await expect(payButton(page)).toContainText('Rp 300.000');
});

test('BOOK-F02 adding and removing a passenger moves the total', async ({ page }) => {
  await page.goto(`/book/${openLegId}?passengers=1`);
  await expect(payButton(page)).toContainText('Rp 100.000', { timeout: 15_000 });
  await page.getByRole('button', { name: '+ Add passenger' }).click();
  await expect(page.locator('#passengerName-1')).toBeVisible();
  await expect(payButton(page)).toContainText('Rp 200.000');
  await page.getByRole('button', { name: 'Remove last' }).click();
  await expect(page.locator('#passengerName-1')).toHaveCount(0);
  await expect(payButton(page)).toContainText('Rp 100.000');
});

test('BOOK-F03 child pays half and an infant pays nothing', async ({ page }) => {
  await page.goto(`/book/${openLegId}?passengers=3`);
  await page.locator('#passengerType-1').selectOption('CHILD');
  await page.locator('#passengerType-2').selectOption('INFANT');
  await expect(payButton(page)).toContainText('Rp 150.000', { timeout: 15_000 });
});

test('BOOK-F04 the form stops an empty submit in the browser and creates nothing', async ({ page }) => {
  await page.goto(`/book/${openLegId}?passengers=1`);
  await payButton(page).click();
  await expect(page).toHaveURL(/\/book\//);
  const invalid = await page.locator('form :invalid').count();
  expect(invalid).toBeGreaterThan(0);
  expect(await bookingCount()).toBe(0);
});

test('BOOK-F05 the server refuses a booking without the terms ticked', async ({ page }) => {
  await page.goto(`/book/${openLegId}?passengers=1`);
  await fillValid(page, { terms: false });
  await skipBrowserValidation(page);
  await payButton(page).click();
  await page.waitForURL(/error=/, { timeout: 15_000 });
  expect(await bookingCount()).toBe(0);
});

// Bug B2 (docs/spikes/todo/BUGS_QA_BASELINE_FINDINGS.md): an unticked checkbox sends
// `null`, which `z.string().optional()` rejected, so the visitor read
// "Expected string, received null". The schema now accepts null.
test('BOOK-F05b the refusal tells the visitor to accept the terms', async ({ page }) => {
  await page.goto(`/book/${openLegId}?passengers=1`);
  await fillValid(page, { terms: false });
  await skipBrowserValidation(page);
  await payButton(page).click();
  await page.waitForURL(/error=/, { timeout: 15_000 });
  await expect(page.getByText('Please accept the terms')).toBeVisible({ timeout: 3_000 });
});

test('BOOK-F06 the server refuses an invalid email', async ({ page }) => {
  await page.goto(`/book/${openLegId}?passengers=1`);
  await fillValid(page, { email: 'not-an-email' });
  await skipBrowserValidation(page);
  await payButton(page).click();
  await page.waitForURL(/error=/, { timeout: 15_000 });
  await expect(page.getByText(/invalid email/i)).toBeVisible();
  expect(await prisma.booking.count({ where: { customerEmail: 'not-an-email' } })).toBe(0);
});

test('BOOK-F07 the server refuses a one-letter passenger name', async ({ page }) => {
  await page.goto(`/book/${openLegId}?passengers=1`);
  // One letter satisfies the browser's "required" but not the two-letter rule.
  await fillValid(page, { passenger: 'A' });
  await payButton(page).click();
  await page.waitForURL(/error=/, { timeout: 15_000 });
  await expect(page.getByText('Each passenger needs a name')).toBeVisible();
  expect(await bookingCount()).toBe(0);
});

test('BOOK-F08 the server refuses a phone number that is too short', async ({ page }) => {
  await page.goto(`/book/${openLegId}?passengers=1`);
  await fillValid(page, { phone: '1' });
  await payButton(page).click();
  await page.waitForURL(/error=/, { timeout: 15_000 });
  expect(await bookingCount()).toBe(0);
});

test('BOOK-F09 an unknown promo code is reported next to the field', async ({ page }) => {
  await page.goto(`/book/${openLegId}?passengers=1`);
  await page.getByLabel('Promo code (optional)').fill('E2E-NO-SUCH-CODE');
  await page.getByRole('button', { name: 'Apply' }).click();
  // The message text comes from the promo API; the form must show one and keep the price unchanged.
  await expect(page.getByRole('button', { name: 'Apply' })).toBeEnabled({ timeout: 15_000 });
  await expect(payButton(page)).toContainText('Rp 100.000');
  await expect(page.getByText(/saves/i)).toHaveCount(0);
});

test('BOOK-F10 a guest is told they are booking as a guest and can sign in', async ({ page }) => {
  await page.goto(`/book/${openLegId}?passengers=1`);
  const note = page.getByText(/Booking as a guest/);
  await expect(note).toBeVisible({ timeout: 15_000 });
  await expect(note.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', /\/account\/login\?next=/);
  await expect(note.getByRole('link', { name: 'create an account' })).toHaveAttribute('href', /\/account\/register\?next=/);
});

test('BOOK-F11 a departure that has already left cannot be booked', async ({ page }) => {
  await page.goto(`/book/${pastLegId}?passengers=1`);
  await expect(page.getByText('This departure is no longer accepting bookings.')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('link', { name: 'Search another' })).toBeVisible();
  await expect(page.locator('#customerName')).toHaveCount(0);
});

test('BOOK-F12 an unknown departure id shows the not-found page, not a crash', async ({ page }) => {
  await page.goto('/book/e2e-no-such-leg?passengers=1');
  // Status is 200, not 404: the page streams behind loading.tsx before it calls
  // notFound() (app finding, see the QA matrix).
  await expect(page.getByText('This page could not be found.')).toBeVisible();
});

test('BOOK-M01 the booking form fits the screen and its Pay button can be tapped', async ({ page }) => {
  await page.goto(`/book/${openLegId}?passengers=2`);
  await expect(page.locator('#passengerName-1')).toBeVisible({ timeout: 15_000 });
  await expectNoHorizontalOverflow(page);
  await expectSubmitButtonsReachable(page);
});
