import { test, expect } from '@playwright/test';
import { loadEnvConfig } from '@next/env';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { createHash } from 'crypto';
import { MS_PER_HOUR } from '../../src/shared/constants/time';
import { requireMockPayments } from './support/mock-payments';
import {
  createCustomer,
  createResetToken,
  removeCustomers,
  loginViaUi,
  TEST_PASSWORD,
} from './support/customers';

loadEnvConfig(process.cwd());
// Requesting a reset sends an email. With a live SMTP key set this file is
// skipped, so no real message is ever sent to a test address.
requireMockPayments();

/**
 * Forgot and reset password. QA matrix: AUTH-030 to AUTH-047.
 *
 * Reset tokens are written straight to the table (the app keeps only the
 * sha256 of the token, so a spec can hold the raw value). Emails are never read:
 * delivery is a human check (AUTH-034).
 */
const prisma = new PrismaClient();

const REQUEST = 'e2e-reset-request@example.invalid';
const VALID = 'e2e-reset-valid@example.invalid';
const GOOGLE = 'e2e-reset-google@example.invalid';
const MISMATCH = 'e2e-reset-mismatch@example.invalid';
const NOBODY = 'e2e-reset-nobody@example.invalid';
const ALL = [REQUEST, VALID, GOOGLE, MISMATCH, NOBODY];
const NEW_PASSWORD = 'e2e-NewPassw0rd!';

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  await removeCustomers(prisma, ALL);
  await createCustomer(prisma, { email: REQUEST, fullName: 'Request Person' });
  await createCustomer(prisma, { email: VALID, fullName: 'Valid Person' });
  await createCustomer(prisma, { email: GOOGLE, fullName: 'Google Person', google: true });
  await createCustomer(prisma, { email: MISMATCH, fullName: 'Mismatch Person' });
});

test.afterAll(async () => {
  await removeCustomers(prisma, ALL);
  await prisma.$disconnect();
});

test('AUTH-030 asking for a reset shows the generic notice and stores a one-hour token', async ({ page }) => {
  await page.goto('/account/forgot-password');
  await page.getByLabel('Email address').fill(REQUEST);
  await page.getByRole('button', { name: 'Send reset link' }).click();

  await expect(page).toHaveURL(/ok=sent/, { timeout: 20_000 });
  await expect(page.getByText(/If an account exists for that email/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Back to sign in' })).toBeVisible();

  const tokens = await prisma.passwordResetToken.findMany({ where: { email: REQUEST } });
  expect(tokens).toHaveLength(1);
  expect(tokens[0].usedAt).toBeNull();
  const minutes = (tokens[0].expiresAt.getTime() - Date.now()) / 60_000;
  expect(minutes).toBeGreaterThan(55);
  expect(minutes).toBeLessThanOrEqual(61);
});

test('AUTH-031 an unknown email gets the same notice and no token is stored', async ({ page }) => {
  await page.goto('/account/forgot-password');
  await page.getByLabel('Email address').fill(NOBODY);
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page).toHaveURL(/ok=sent/, { timeout: 20_000 });
  await expect(page.getByText(/If an account exists for that email/)).toBeVisible();
  expect(await prisma.passwordResetToken.count({ where: { email: NOBODY } })).toBe(0);
});

test('AUTH-032 an empty or malformed email is stopped, and the server error renders', async ({ page }) => {
  await page.goto('/account/forgot-password');
  await page.getByLabel('Email address').fill('not-an-email');
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page).toHaveURL(/\/account\/forgot-password$/);
  expect(await page.getByLabel('Email address').evaluate((el: HTMLInputElement) => el.validity.valid)).toBe(false);

  await page.goto('/account/forgot-password?error=invalid');
  await expect(page.getByText('Please enter a valid email address.')).toBeVisible();
});

test('AUTH-040 a valid link sets a new password, signs the customer in and burns the token', async ({ page, context }) => {
  const raw = 'e2e-reset-token-valid-0001';
  await createResetToken(prisma, { email: VALID, rawToken: raw });

  await page.goto(`/account/reset-password?token=${raw}`);
  await page.getByLabel('New password').fill(NEW_PASSWORD);
  await page.getByLabel('Confirm password').fill(NEW_PASSWORD);
  await page.getByRole('button', { name: 'Set new password' }).click();

  await expect(page).toHaveURL(/\/account\?ok=password_changed/, { timeout: 20_000 });
  await expect(page.getByText('password changed ✓')).toBeVisible();

  const used = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: createHash('sha256').update(raw).digest('hex') },
  });
  expect(used?.usedAt, 'token is marked used').not.toBeNull();

  // The old password is dead, the new one works.
  await context.clearCookies();
  await page.goto('/account/login');
  await page.getByLabel('Email').fill(VALID);
  await page.getByLabel('Password', { exact: true }).fill(TEST_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/error=credentials/, { timeout: 15_000 });
  await loginViaUi(page, VALID, NEW_PASSWORD);
});

test('AUTH-041 a link that was already used shows "Link expired"', async ({ page }) => {
  const raw = 'e2e-reset-token-used-0002';
  await createResetToken(prisma, { email: VALID, rawToken: raw, usedAt: new Date() });
  await page.goto(`/account/reset-password?token=${raw}`);
  await page.getByLabel('New password').fill(NEW_PASSWORD);
  await page.getByLabel('Confirm password').fill(NEW_PASSWORD);
  await page.getByRole('button', { name: 'Set new password' }).click();
  await expect(page).toHaveURL(/error=expired/, { timeout: 20_000 });
  await expect(page.getByText('Link expired')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Request a new link' })).toBeVisible();
});

test('AUTH-042 a link past its hour shows "Link expired" and does not change the password', async ({ page }) => {
  const raw = 'e2e-reset-token-old-0003';
  await createResetToken(prisma, { email: MISMATCH, rawToken: raw, expiresAt: new Date(Date.now() - MS_PER_HOUR) });
  await page.goto(`/account/reset-password?token=${raw}`);
  await page.getByLabel('New password').fill(NEW_PASSWORD);
  await page.getByLabel('Confirm password').fill(NEW_PASSWORD);
  await page.getByRole('button', { name: 'Set new password' }).click();
  await expect(page).toHaveURL(/error=expired/, { timeout: 20_000 });
  await expect(page.getByText('Link expired')).toBeVisible();
  const row = await prisma.customer.findUnique({ where: { email: MISMATCH } });
  expect(row?.passwordHash).toBeTruthy();
  expect(await bcrypt.compare(TEST_PASSWORD, row!.passwordHash!)).toBe(true);
});

test('AUTH-043 a made-up token is treated as expired', async ({ page }) => {
  await page.goto('/account/reset-password?token=this-token-was-never-issued');
  await page.getByLabel('New password').fill(NEW_PASSWORD);
  await page.getByLabel('Confirm password').fill(NEW_PASSWORD);
  await page.getByRole('button', { name: 'Set new password' }).click();
  await expect(page).toHaveURL(/error=expired/, { timeout: 20_000 });
  await expect(page.getByText('Link expired')).toBeVisible();
});

test('AUTH-044 opening the reset page with no token goes to the forgot-password form', async ({ page }) => {
  await page.goto('/account/reset-password');
  await expect(page).toHaveURL(/\/account\/forgot-password$/);
});

test('AUTH-045 two different passwords are refused and the link stays usable', async ({ page }) => {
  const raw = 'e2e-reset-token-mismatch-0004';
  await createResetToken(prisma, { email: MISMATCH, rawToken: raw });
  await page.goto(`/account/reset-password?token=${raw}`);
  await page.getByLabel('New password').fill(NEW_PASSWORD);
  await page.getByLabel('Confirm password').fill(`${NEW_PASSWORD}-different`);
  await page.getByRole('button', { name: 'Set new password' }).click();

  await expect(page).toHaveURL(/error=invalid/, { timeout: 20_000 });
  await expect(page.getByText('Passwords must match and be at least 8 characters.')).toBeVisible();
  const row = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: createHash('sha256').update(raw).digest('hex') },
  });
  expect(row?.usedAt, 'a refused attempt must not burn the link').toBeNull();
  // The token rides along in the URL so the customer can try again.
  expect(page.url()).toContain(`token=${raw}`);
});

test('AUTH-047 a Google-only customer can set a password through the reset link', async ({ page, context }) => {
  const raw = 'e2e-reset-token-google-0005';
  await createResetToken(prisma, { email: GOOGLE, rawToken: raw });
  await page.goto(`/account/reset-password?token=${raw}`);
  await page.getByLabel('New password').fill(NEW_PASSWORD);
  await page.getByLabel('Confirm password').fill(NEW_PASSWORD);
  await page.getByRole('button', { name: 'Set new password' }).click();
  await expect(page).toHaveURL(/\/account\?ok=password_changed/, { timeout: 20_000 });

  await context.clearCookies();
  await loginViaUi(page, GOOGLE, NEW_PASSWORD);
});
