import { test, expect } from '@playwright/test';
import { loadEnvConfig } from '@next/env';
import { PrismaClient } from '@prisma/client';
import { createCustomer, removeCustomers, TEST_PASSWORD } from './support/customers';

loadEnvConfig(process.cwd());

/**
 * Customer registration (/account/register). QA matrix: AUTH-020 to AUTH-027.
 *
 * Accounts are created through the real form or directly, and removed
 * afterwards. No message is sent on registration.
 */
const prisma = new PrismaClient();

const NEW = 'e2e-register-new@example.invalid';
const NO_TERMS = 'e2e-register-noterms@example.invalid';
const SHORT = 'e2e-register-short@example.invalid';
const NEXT = 'e2e-register-next@example.invalid';
const OFFSITE = 'e2e-register-offsite@example.invalid';
const TAKEN = 'e2e-register-taken@example.invalid';
const GOOGLE = 'e2e-register-google@example.invalid';
const ALL = [NEW, NO_TERMS, SHORT, NEXT, OFFSITE, TAKEN, GOOGLE];

test.beforeAll(async () => {
  await removeCustomers(prisma, ALL);
  await createCustomer(prisma, { email: TAKEN, fullName: 'Already Here' });
  await createCustomer(prisma, { email: GOOGLE, fullName: 'Google Here', google: true });
});

test.afterAll(async () => {
  await removeCustomers(prisma, ALL);
  await prisma.$disconnect();
});

async function fillForm(
  page: import('@playwright/test').Page,
  v: { name?: string; email: string; phone?: string; password?: string; terms?: boolean },
) {
  await page.getByLabel('Full name').fill(v.name ?? 'Reg Tester');
  await page.getByLabel('Email').fill(v.email);
  if (v.phone) await page.getByLabel('Phone (WhatsApp)').fill(v.phone);
  await page.getByLabel('Password', { exact: true }).fill(v.password ?? TEST_PASSWORD);
  if (v.terms !== false) await page.getByRole('checkbox').check();
}

test('AUTH-020 a new customer registers, is signed in, and the email is stored in lower case', async ({ page }) => {
  await page.goto('/account/register');
  await fillForm(page, { name: 'Reg Tester', email: 'E2E-Register-New@Example.invalid', phone: '+62 812 3456 7890' });
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page).toHaveURL(/\/account$/, { timeout: 20_000 });
  await expect(page.getByRole('heading', { name: 'Hi, Reg' })).toBeVisible();

  const row = await prisma.customer.findUnique({ where: { email: NEW } });
  expect(row, 'customer row should exist under the lower-case email').toBeTruthy();
  expect(row?.fullName).toBe('Reg Tester');
  expect(row?.phoneNumber).toBe('+62 812 3456 7890');
  expect(row?.passwordHash, 'a password hash is stored, never the password').toBeTruthy();
  expect(row?.passwordHash).not.toBe(TEST_PASSWORD);
});

test('AUTH-022 registering an email that already has an account says so and offers sign-in', async ({ page }) => {
  await page.goto('/account/register');
  await fillForm(page, { email: TAKEN });
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/error=exists/, { timeout: 20_000 });
  await expect(page.getByText('An account with that email already exists.')).toBeVisible();
  await page.getByRole('link', { name: 'Sign in instead' }).click();
  await expect(page).toHaveURL(/\/account\/login/);
  expect(await prisma.customer.count({ where: { email: TAKEN } })).toBe(1);
});

test('AUTH-023 the terms box is required before an account is created', async ({ page }) => {
  await page.goto('/account/register');
  await fillForm(page, { email: NO_TERMS, terms: false });
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/account\/register$/);
  const valid = await page.getByRole('checkbox').evaluate((el: HTMLInputElement) => el.validity.valid);
  expect(valid).toBe(false);
  expect(await prisma.customer.count({ where: { email: NO_TERMS } })).toBe(0);

  await page.goto('/account/register?error=terms');
  await expect(page.getByText('Please accept the Terms and Privacy Policy.')).toBeVisible();
});

test('AUTH-023b the server refuses an unticked terms box with the terms message', async ({ page }) => {
  // Bug B2: the server used to answer "fill in all required fields" here.
  await page.goto('/account/register');
  await fillForm(page, { email: NO_TERMS, terms: false });
  await page.locator('form').filter({ has: page.getByLabel('Full name') }).evaluate((f) => ((f as HTMLFormElement).noValidate = true));
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/error=terms/, { timeout: 20_000 });
  await expect(page.getByText('Please accept the Terms and Privacy Policy.')).toBeVisible();
  expect(await prisma.customer.count({ where: { email: NO_TERMS } })).toBe(0);
});

test('AUTH-024 a short name or password is stopped before it is sent, and the server error renders', async ({ page }) => {
  await page.goto('/account/register');
  await fillForm(page, { name: 'A', email: SHORT, password: 'short' });
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/account\/register$/);
  expect(await page.getByLabel('Full name').evaluate((el: HTMLInputElement) => el.validity.valid)).toBe(false);
  expect(
    await page.getByLabel('Password', { exact: true }).evaluate((el: HTMLInputElement) => el.validity.valid),
  ).toBe(false);
  expect(await prisma.customer.count({ where: { email: SHORT } })).toBe(0);

  await page.goto('/account/register?error=invalid');
  await expect(page.getByText('Please fill in all required fields with valid values.')).toBeVisible();
});

test('AUTH-025 registering from a sign-in link carries the customer on to where they were going', async ({ page }) => {
  await page.goto('/account/register?next=/b');
  await fillForm(page, { email: NEXT });
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/b$/, { timeout: 20_000 });
});

test('AUTH-025b registering never sends the new customer to another site', async ({ page }) => {
  // Bug B1: `next` used to go straight into redirect(); now only a path on this site is followed.
  await page.route('https://offsite.example.invalid/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<p>off-site</p>' }),
  );
  await page.goto(`/account/register?next=${encodeURIComponent('https://offsite.example.invalid/phish')}`);
  await fillForm(page, { email: OFFSITE });
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/account(\?|$)/, { timeout: 20_000 });
  expect(new URL(page.url()).hostname).not.toBe('offsite.example.invalid');
});

test('AUTH-026 the phone number is optional', async ({ page }) => {
  const email = 'e2e-register-nophone@example.invalid';
  await removeCustomers(prisma, [email]);
  try {
    await page.goto('/account/register');
    await fillForm(page, { email });
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page).toHaveURL(/\/account$/, { timeout: 20_000 });
    const row = await prisma.customer.findUnique({ where: { email } });
    expect(row?.phoneNumber).toBeNull();
  } finally {
    await removeCustomers(prisma, [email]);
  }
});

test('AUTH-027 an email that already belongs to a Google-only account is treated as taken', async ({ page }) => {
  await page.goto('/account/register');
  await fillForm(page, { email: GOOGLE });
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/error=exists/, { timeout: 20_000 });
  const row = await prisma.customer.findUnique({ where: { email: GOOGLE } });
  expect(row?.passwordHash, 'registering must not add a password to a Google-only account').toBeNull();
});
