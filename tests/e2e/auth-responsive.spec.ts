import { test, expect } from '@playwright/test';
import { loadEnvConfig } from '@next/env';
import { PrismaClient } from '@prisma/client';
import { createCustomer, removeCustomers, loginViaUi } from './support/customers';
import { VIEWPORTS, expectNoHorizontalOverflow } from './support/overflow';

loadEnvConfig(process.cwd());

/**
 * Sign-in, register, reset, lookup and account pages at phone, tablet and
 * desktop width: nothing scrolls sideways and every form field has a label a
 * screen reader can find. QA matrix: AUTH-070 and AUTH-072. mobile-layout.spec.ts
 * already checks `/b` at one device width; this adds 375, 768 and 1280.
 *
 * One fixture customer, removed afterwards. No gateway or messaging call.
 */
const prisma = new PrismaClient();
const EMAIL = 'e2e-responsive@example.invalid';

test.beforeAll(async () => {
  await removeCustomers(prisma, [EMAIL]);
  await createCustomer(prisma, { email: EMAIL, fullName: 'Responsive Person' });
});

test.afterAll(async () => {
  await removeCustomers(prisma, [EMAIL]);
  await prisma.$disconnect();
});

const PUBLIC_PAGES = [
  { path: '/b', name: 'find booking', fields: ['Booking reference'] },
  { path: '/account/login', name: 'sign in', fields: ['Email', 'Password'] },
  { path: '/account/register', name: 'register', fields: ['Full name', 'Email', 'Phone (WhatsApp)', 'Password'] },
  { path: '/account/forgot-password', name: 'forgot password', fields: ['Email address'] },
  { path: '/account/forgot-password?ok=sent', name: 'forgot password (sent)', fields: [] },
  { path: '/account/reset-password?token=x', name: 'reset password', fields: ['New password', 'Confirm password'] },
  { path: '/account/reset-password?error=expired', name: 'reset link expired', fields: [] },
  { path: '/account/login?error=locked', name: 'sign in (locked)', fields: ['Email', 'Password'] },
];

for (const vp of VIEWPORTS) {
  test.describe(`${vp.width}px`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    for (const p of PUBLIC_PAGES) {
      test(`AUTH-070 ${p.name} does not scroll sideways at ${vp.width}px, fields are labelled (AUTH-072)`, async ({ page }) => {
        await page.goto(p.path);
        await expect(page.locator('header').first()).toBeVisible({ timeout: 15_000 });
        await expectNoHorizontalOverflow(page);
        for (const label of p.fields) {
          await expect(page.getByLabel(label, { exact: true })).toBeVisible();
        }
      });
    }

    test(`AUTH-070 account does not scroll sideways at ${vp.width}px, fields are labelled (AUTH-072)`, async ({ page }) => {
      await loginViaUi(page, EMAIL);
      await expectNoHorizontalOverflow(page);
      for (const label of ['Full name', 'Phone (WhatsApp preferred)', 'Nationality', 'Current password', 'New password']) {
        await expect(page.getByLabel(label, { exact: true })).toBeVisible();
      }
    });
  });
}
