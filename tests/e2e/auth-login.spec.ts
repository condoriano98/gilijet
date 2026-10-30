import { test, expect } from '@playwright/test';
import { loadEnvConfig } from '@next/env';
import { PrismaClient } from '@prisma/client';
import { CUSTOMER_COOKIE } from '../../src/shared/constants/auth';
import { createCustomer, removeCustomers, loginViaUi, TEST_PASSWORD } from './support/customers';

loadEnvConfig(process.cwd());

/**
 * Customer sign-in (/account/login). QA matrix: AUTH-001 to AUTH-013, AUTH-080.
 *
 * Every account is created here and removed afterwards (own emails, own failed
 * login rows). No gateway or messaging call is made. The Google button itself
 * is not exercised: it needs a real Google round trip (AUTH-010, needs human).
 */
const prisma = new PrismaClient();

const OK = 'e2e-login-ok@example.invalid';
const GOOGLE_ONLY = 'e2e-login-google@example.invalid';
const LOCKED = 'e2e-login-locked@example.invalid';
const NOBODY = 'e2e-login-nobody@example.invalid';
const ALL = [OK, GOOGLE_ONLY, LOCKED, NOBODY];

test.beforeAll(async () => {
  await removeCustomers(prisma, ALL);
  await createCustomer(prisma, { email: OK, fullName: 'Login Tester' });
  await createCustomer(prisma, { email: GOOGLE_ONLY, fullName: 'Google Person', google: true });
  await createCustomer(prisma, { email: LOCKED, fullName: 'Locked Person' });
});

test.afterAll(async () => {
  await removeCustomers(prisma, ALL);
  await prisma.$disconnect();
});

async function submitLogin(page: import('@playwright/test').Page, email: string, password: string) {
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

test('AUTH-001 a customer signs in and lands on their account', async ({ page }) => {
  await loginViaUi(page, OK);
  await expect(page.getByRole('heading', { name: 'Hi, Login' })).toBeVisible();
  await expect(page.getByText(OK)).toBeVisible();
});

test('AUTH-002 sign-in sends the customer on to the page they asked for', async ({ page }) => {
  await page.goto('/account/login?next=/b');
  await submitLogin(page, OK, TEST_PASSWORD);
  await expect(page).toHaveURL(/\/b$/, { timeout: 20_000 });
});

test('AUTH-003 a wrong password shows one generic error and stays signed out', async ({ page }) => {
  await page.goto('/account/login');
  await submitLogin(page, OK, 'definitely-wrong-1');
  await expect(page).toHaveURL(/error=credentials/);
  await expect(page.getByText('Wrong email or password.')).toBeVisible();
  await page.goto('/account');
  await expect(page).toHaveURL(/\/account\/login/);
});

test('AUTH-004 an unknown email gets the same error as a wrong password', async ({ page }) => {
  await page.goto('/account/login');
  await submitLogin(page, NOBODY, TEST_PASSWORD);
  await expect(page).toHaveURL(/error=credentials/);
  await expect(page.getByText('Wrong email or password.')).toBeVisible();
});

test('AUTH-005 a malformed form is stopped before it is sent, and the server error renders', async ({ page }) => {
  await page.goto('/account/login');
  await page.getByLabel('Email').fill('not-an-email');
  await page.getByLabel('Password', { exact: true }).fill('short');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/account\/login$/);
  const email = await page.getByLabel('Email').evaluate((el: HTMLInputElement) => el.validity.valid);
  expect(email).toBe(false);

  await page.goto('/account/login?error=invalid');
  await expect(page.getByText('Check your email and password.')).toBeVisible();
});

test('AUTH-006 five wrong passwords lock the email for a while, even for the right one', async ({ page }) => {
  await page.goto('/account/login');
  for (let i = 0; i < 5; i++) {
    await submitLogin(page, LOCKED, `wrong-password-${i}`);
    await expect(page).toHaveURL(/error=credentials/, { timeout: 15_000 });
    await page.goto('/account/login');
  }
  await submitLogin(page, LOCKED, TEST_PASSWORD);
  await expect(page).toHaveURL(/error=locked/, { timeout: 15_000 });
  await expect(page.getByText(/Too many failed attempts/)).toBeVisible();
});

test('AUTH-007 a Google-only account cannot sign in with any password', async ({ page }) => {
  await page.goto('/account/login');
  await submitLogin(page, GOOGLE_ONLY, TEST_PASSWORD);
  await expect(page).toHaveURL(/error=credentials/);
  await expect(page.getByText('Wrong email or password.')).toBeVisible();
});

test('AUTH-008 every Google sign-in error has its own readable message', async ({ page }) => {
  const cases: Array<[string, RegExp]> = [
    ['google_unavailable', /Google sign-in is currently unavailable/],
    ['google_cancelled', /Google sign-in was cancelled/],
    ['google_state', /could not be verified/],
    ['google_exchange', /couldn.t complete sign-in with Google/],
    ['google_unverified', /Google email isn.t verified/],
  ];
  for (const [code, text] of cases) {
    await page.goto(`/account/login?error=${code}`);
    await expect(page.getByText(text)).toBeVisible();
  }
});

test('AUTH-009 a signed-in customer is sent from sign-in and register to their account', async ({ page }) => {
  await loginViaUi(page, OK);
  await page.goto('/account/login');
  await expect(page).toHaveURL(/\/account$/);
  await page.goto('/account/register');
  await expect(page).toHaveURL(/\/account$/);
});

test('AUTH-011 the forgot-password link opens the reset request form', async ({ page }) => {
  await page.goto('/account/login');
  await page.getByRole('link', { name: 'Forgot password?' }).click();
  await expect(page).toHaveURL(/\/account\/forgot-password$/);
  await expect(page.getByLabel('Email address')).toBeVisible();
});

test('AUTH-012 the create-account link keeps the page the customer was heading to', async ({ page }) => {
  await page.goto('/account/login?next=/b');
  await page.getByRole('link', { name: 'Create an account' }).click();
  await expect(page).toHaveURL(/\/account\/register\?next=%2Fb$/);
});

// `next` comes from a hidden form field. It used to go straight into redirect(),
// so ?next=https://other-site sent a freshly signed-in customer to another site
// (bug B1, docs/spikes/todo/BUGS_QA_BASELINE_FINDINGS.md). It is now passed
// through safeNext(): only a path on this site is followed.
for (const [label, next] of [
  ['an absolute URL', 'https://offsite.example.invalid/phish'],
  ['a protocol-relative URL', '//offsite.example.invalid/phish'],
  ['a backslash form', '/\\offsite.example.invalid/phish'],
] as const) {
  test(`AUTH-013 sign-in never redirects off-site (${label})`, async ({ page }) => {
    await page.route('https://offsite.example.invalid/**', (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: '<p>off-site</p>' }),
    );
    await page.goto(`/account/login?next=${encodeURIComponent(next)}`);
    await submitLogin(page, OK, TEST_PASSWORD);
    await expect(page).toHaveURL(/\/account(\?|$)/, { timeout: 20_000 });
    expect(new URL(page.url()).hostname).not.toBe('offsite.example.invalid');
  });
}

test('AUTH-013b sign-in still follows a path on this site', async ({ page }) => {
  await page.goto('/account/login?next=/b');
  await submitLogin(page, OK, TEST_PASSWORD);
  await expect(page).toHaveURL(/\/b$/, { timeout: 20_000 });
});

test('AUTH-080 the session cookie is HttpOnly and not readable from the page', async ({ page, context }) => {
  await loginViaUi(page, OK);
  const cookie = (await context.cookies()).find((c) => c.name === CUSTOMER_COOKIE);
  expect(cookie, 'customer session cookie should be set after sign-in').toBeTruthy();
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.sameSite).not.toBe('None');
  const visible = await page.evaluate((name) => document.cookie.includes(name), CUSTOMER_COOKIE);
  expect(visible).toBe(false);
});
