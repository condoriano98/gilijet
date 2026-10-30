import { test, expect } from '@playwright/test';
import { loadEnvConfig } from '@next/env';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import {
  createCustomer,
  removeCustomers,
  createTrip,
  removeTrip,
  createConfirmedBooking,
  createResetToken,
  loginViaUi,
  TEST_PASSWORD,
} from './support/customers';

loadEnvConfig(process.cwd());

/**
 * "My account" (/account). QA matrix: AUTH-050 to AUTH-060.
 *
 * Own customers, route and bookings (a future trip in 2090 and a past one in
 * 2020), removed afterwards. Relies on `pnpm seed:qa` (boat). Nothing here
 * pays, refunds or sends a message.
 */
const prisma = new PrismaClient();

const OWNER = 'e2e-account-owner@example.invalid';
const EMPTY = 'e2e-account-empty@example.invalid';
const GOOGLE = 'e2e-account-google@example.invalid';
const PROFILE = 'e2e-account-profile@example.invalid';
const PASSWORD = 'e2e-account-password@example.invalid';
const SIGNOUT = 'e2e-account-signout@example.invalid';
const ALL = [OWNER, EMPTY, GOOGLE, PROFILE, PASSWORD, SIGNOUT];

const ORIGIN = 'E2E Account Origin';
const DESTINATION = 'E2E Account Dest';
const REF_FUTURE = 'E2E-ACCT-FUTURE';
const REF_PAST = 'E2E-ACCT-PAST';
const REF_BY_EMAIL = 'E2E-ACCT-BYMAIL';
const NEW_PASSWORD = 'e2e-NewPassw0rd!';

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  await removeCustomers(prisma, ALL);
  await removeTrip(prisma, [ORIGIN]);

  const owner = await createCustomer(prisma, { email: OWNER, fullName: 'Ana Owner' });
  await createCustomer(prisma, { email: EMPTY, fullName: 'Empty Person' });
  await createCustomer(prisma, { email: GOOGLE, fullName: 'Google Person', google: true });
  await createCustomer(prisma, { email: PROFILE, fullName: 'Profile Person', phoneNumber: '+62 811 0000 0000' });
  await createCustomer(prisma, { email: PASSWORD, fullName: 'Password Person' });
  await createCustomer(prisma, { email: SIGNOUT, fullName: 'Signout Person' });

  const { boat, legs } = await createTrip(prisma, {
    origin: ORIGIN,
    destination: DESTINATION,
    dates: ['2090-06-12', '2020-01-10'],
  });
  const [future, past] = legs;
  await createConfirmedBooking(prisma, {
    reference: REF_FUTURE,
    legId: future.id,
    operatorId: boat.operatorId,
    email: OWNER,
    customerId: owner.id,
    amount: 150_000,
  });
  await createConfirmedBooking(prisma, {
    reference: REF_PAST,
    legId: past.id,
    operatorId: boat.operatorId,
    email: OWNER,
    customerId: owner.id,
  });
  // Booked as a guest with the same email, before the customer registered:
  // no customerId, but it must still show up.
  await createConfirmedBooking(prisma, {
    reference: REF_BY_EMAIL,
    legId: future.id,
    operatorId: boat.operatorId,
    email: OWNER,
  });
});

test.afterAll(async () => {
  await removeCustomers(prisma, ALL);
  await removeTrip(prisma, [ORIGIN]);
  await prisma.$disconnect();
});

test('AUTH-050 a signed-out visitor is sent to sign-in', async ({ page }) => {
  await page.goto('/account');
  await expect(page).toHaveURL(/\/account\/login/);
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
});

test('AUTH-051 the account lists upcoming trips and history with route, reference and a View link', async ({ page }) => {
  await loginViaUi(page, OWNER);
  await expect(page.getByRole('heading', { name: 'Hi, Ana' })).toBeVisible();

  const upcoming = page.getByRole('heading', { name: 'Upcoming trips' });
  await expect(upcoming).toBeVisible();
  await expect(page.getByText(REF_FUTURE)).toBeVisible();
  await expect(page.getByText(`${ORIGIN} → ${DESTINATION}`).first()).toBeVisible();

  const history = page.getByRole('heading', { name: 'Booking history' });
  await expect(history).toBeVisible();
  await expect(page.getByText(REF_PAST)).toBeVisible();

  await page.getByRole('link', { name: 'View', exact: true }).first().click();
  await expect(page).toHaveURL(/\/b\/E2E-ACCT-/);
});

test('AUTH-052 a booking made as a guest with the same email shows up in the account', async ({ page }) => {
  await loginViaUi(page, OWNER);
  await expect(page.getByText(REF_BY_EMAIL)).toBeVisible();
});

test('AUTH-053 a past confirmed trip offers a review, a future one does not', async ({ page }) => {
  await loginViaUi(page, OWNER);
  const rateLinks = page.getByRole('link', { name: /Rate your trip/ });
  await expect(rateLinks).toHaveCount(1);
  await expect(rateLinks.first()).toHaveAttribute('href', /\/reviews\/new\?bookingId=/);
});

test('AUTH-054 a customer with no bookings sees the empty state and a way to book', async ({ page }) => {
  await loginViaUi(page, EMPTY);
  await expect(page.getByText('No upcoming trips.')).toBeVisible();
  await expect(page.getByRole('link', { name: /Find a boat/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Booking history' })).toHaveCount(0);
});

test('AUTH-055 profile changes are saved and shown again after a reload', async ({ page }) => {
  await loginViaUi(page, PROFILE);
  await page.getByLabel('Full name').fill('Renamed Person');
  await page.getByLabel('Phone (WhatsApp preferred)').fill('+62 822 1111 2222');
  await page.getByLabel('Nationality').fill('Indonesian');
  await page.getByRole('button', { name: 'Save changes' }).click();

  await expect(page).toHaveURL(/ok=profile_updated/, { timeout: 20_000 });
  await expect(page.getByText('profile updated ✓')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Hi, Renamed' })).toBeVisible();

  await page.reload();
  await expect(page.getByLabel('Phone (WhatsApp preferred)')).toHaveValue('+62 822 1111 2222');
  await expect(page.getByLabel('Nationality')).toHaveValue('Indonesian');
  const row = await prisma.customer.findUnique({ where: { email: PROFILE } });
  expect(row?.fullName).toBe('Renamed Person');
});

test('AUTH-056 emptying the phone field clears it', async ({ page }) => {
  await loginViaUi(page, PROFILE);
  await page.getByLabel('Phone (WhatsApp preferred)').fill('');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page).toHaveURL(/ok=profile_updated/, { timeout: 20_000 });
  const row = await prisma.customer.findUnique({ where: { email: PROFILE } });
  expect(row?.phoneNumber).toBeNull();
});

test('AUTH-057 changing the password needs the current one, then the new one works', async ({ page, context }) => {
  await loginViaUi(page, PASSWORD);

  await page.getByLabel('Current password').fill('not-my-password');
  await page.getByLabel('New password').fill(NEW_PASSWORD);
  await page.getByRole('button', { name: 'Update password' }).click();
  await expect(page).toHaveURL(/error=wrong_password/, { timeout: 20_000 });
  await expect(page.getByText('wrong password', { exact: true })).toBeVisible();
  const before = await prisma.customer.findUnique({ where: { email: PASSWORD } });
  expect(await bcrypt.compare(TEST_PASSWORD, before!.passwordHash!)).toBe(true);

  await page.getByLabel('Current password').fill(TEST_PASSWORD);
  await page.getByLabel('New password').fill(NEW_PASSWORD);
  await page.getByRole('button', { name: 'Update password' }).click();
  await expect(page).toHaveURL(/ok=password_changed/, { timeout: 20_000 });
  await expect(page.getByText('password changed ✓')).toBeVisible();

  await context.clearCookies();
  await loginViaUi(page, PASSWORD, NEW_PASSWORD);
});

test('AUTH-058 a new password under eight characters is stopped before it is sent', async ({ page }) => {
  // Runs after AUTH-057 (serial), which left this customer on NEW_PASSWORD.
  await loginViaUi(page, PASSWORD, NEW_PASSWORD);
  await page.getByLabel('Current password').fill(NEW_PASSWORD);
  await page.getByLabel('New password').fill('short');
  await page.getByRole('button', { name: 'Update password' }).click();
  await expect(page).toHaveURL(/\/account$/);
  expect(await page.getByLabel('New password').evaluate((el: HTMLInputElement) => el.validity.valid)).toBe(false);
});

test('AUTH-059 a Google-only account sees a pointer to forgot-password instead of a password form', async ({ page }) => {
  // Google-only accounts cannot sign in with a password, so give the session
  // by finishing a reset first.
  const raw = 'e2e-account-google-session-0001';
  await createResetToken(prisma, { email: GOOGLE, rawToken: raw });
  await page.goto(`/account/reset-password?token=${raw}`);
  await page.getByLabel('New password').fill(NEW_PASSWORD);
  await page.getByLabel('Confirm password').fill(NEW_PASSWORD);
  await page.getByRole('button', { name: 'Set new password' }).click();
  await expect(page).toHaveURL(/\/account\?ok=password_changed/, { timeout: 20_000 });

  // Now take the password away again so the account is Google-only, and reload.
  await prisma.customer.update({ where: { email: GOOGLE }, data: { passwordHash: null } });
  await page.goto('/account');
  await expect(page.getByText(/Your account uses Google sign-in/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'use the forgot-password flow' })).toHaveAttribute(
    'href',
    '/account/forgot-password',
  );
  await expect(page.getByLabel('Current password')).toHaveCount(0);
});

test('AUTH-060 signing out ends the session', async ({ page }) => {
  await loginViaUi(page, SIGNOUT);
  await page.getByRole('button', { name: 'Sign out' }).first().click();
  await expect(page).toHaveURL(/\/$/, { timeout: 20_000 });
  await page.goto('/account');
  await expect(page).toHaveURL(/\/account\/login/);
});
