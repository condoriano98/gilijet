import { test, expect } from '@playwright/test';
import { loadEnvConfig } from '@next/env';
import { PrismaClient } from '@prisma/client';
import { removeBookings } from './support/fixtures';
import { createTrip, createConfirmedBooking, removeTrip } from './support/customers';

loadEnvConfig(process.cwd());

/**
 * "Find your booking" (/b): a guest types the reference from the confirmation
 * email and lands on the booking page. QA matrix: LOOK-001 to LOOK-006.
 *
 * Own route and booking in 2090, removed afterwards. Relies on `pnpm seed:qa`
 * (boat). Never opens checkout or sends a message.
 */
const prisma = new PrismaClient();

const ORIGIN = 'E2E Lookup Origin';
const DESTINATION = 'E2E Lookup Dest';
const REF = 'E2E-LOOKUP-001';
const EMAIL = 'e2e-lookup@example.invalid';

test.beforeAll(async () => {
  await removeBookings(prisma, { bookingReference: REF });
  await removeTrip(prisma, [ORIGIN]);
  const { boat, legs } = await createTrip(prisma, {
    origin: ORIGIN,
    destination: DESTINATION,
    dates: ['2090-06-12'],
  });
  await createConfirmedBooking(prisma, {
    reference: REF,
    legId: legs[0].id,
    operatorId: boat.operatorId,
    email: EMAIL,
  });
});

test.afterAll(async () => {
  await removeBookings(prisma, { bookingReference: REF });
  await removeTrip(prisma, [ORIGIN]);
  await prisma.$disconnect();
});

test('LOOK-001 a guest finds their booking by its reference', async ({ page }) => {
  await page.goto('/b');
  await page.getByLabel('Booking reference').fill(REF);
  await page.getByRole('button', { name: 'Look up' }).click();
  await expect(page).toHaveURL(new RegExp(`/b/${REF}$`), { timeout: 20_000 });
  await expect(page.locator('body')).toContainText(REF);
});

test('LOOK-002 the reference is trimmed and upper-cased before the lookup', async ({ page }) => {
  await page.goto('/b');
  await page.getByLabel('Booking reference').fill(`  ${REF.toLowerCase()}  `);
  await page.getByRole('button', { name: 'Look up' }).click();
  await expect(page).toHaveURL(new RegExp(`/b/${REF}$`), { timeout: 20_000 });
  await expect(page.locator('body')).toContainText(REF);
});

test('LOOK-003 an unknown reference ends on a not-found page, not a booking', async ({ page }) => {
  await page.goto('/b/E2E-DOES-NOT-EXIST');
  // No custom not-found.tsx exists, so this is Next's default not-found page.
  // The status is 200, not 404: the page streams behind loading.tsx before it
  // calls notFound() (app finding, see the QA matrix).
  await expect(page.getByText('This page could not be found.')).toBeVisible();
  await expect(page.getByLabel('Booking reference')).toHaveCount(0);
});

test('LOOK-004 an empty reference cannot be submitted', async ({ page }) => {
  await page.goto('/b');
  await page.getByRole('button', { name: 'Look up' }).click();
  await expect(page).toHaveURL(/\/b$/);
  const valid = await page.getByLabel('Booking reference').evaluate((el: HTMLInputElement) => el.validity.valid);
  expect(valid).toBe(false);
});

test('LOOK-005 the missing-reference error is shown when the server sends it', async ({ page }) => {
  await page.goto('/b?error=missing');
  await expect(page.getByText('Please enter a reference.')).toBeVisible();
});

test('LOOK-006 the lookup form is reachable from the sign-in page', async ({ page }) => {
  await page.goto('/account/login');
  await page.getByRole('link', { name: 'Look up your booking' }).click();
  await expect(page).toHaveURL(/\/b$/);
  await expect(page.getByLabel('Booking reference')).toBeVisible();
});
