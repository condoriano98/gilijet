import { test, expect } from '@playwright/test';

/**
 * Opt-in smoke test of the real DOKU hand-off on the deployed staging site,
 * using the Rp 1 departure from `pnpm seed:one-rupiah`.
 *
 *   E2E_ALLOW_REMOTE=1 E2E_LIVE_DOKU=1 E2E_BASE_URL=https://<staging host> pnpm exec playwright test doku-one-rupiah
 *
 * Owner's rule (2026-10-31): e2e never writes to the staging database. This spec
 * does (the booking below is created on the deployed site), so it stays off
 * until the owner gives an explicit go for a run; `E2E_ALLOW_REMOTE=1` is that go.
 *
 * It creates a real DOKU payment session for Rp 1 and stops on DOKU's hosted
 * page. It never pays: paying Rp 1 (QRIS, or a Mandiri/BRI virtual account;
 * BCA VA and some e-wallets need Rp 10.000) is a manual step. The booking is
 * left PENDING_PAYMENT and expires on its own.
 *
 * Skipped unless both variables are set, so the default suite and CI never open
 * a live DOKU session. The deployed site writes one PENDING_PAYMENT booking.
 */
const base = process.env.E2E_BASE_URL ?? '';
test.skip(
  process.env.E2E_LIVE_DOKU !== '1' || !base,
  'opt-in: set E2E_LIVE_DOKU=1 and E2E_BASE_URL to the staging site',
);
test.skip(/gilifast\.com/i.test(base) && !/staging/i.test(base), 'never run against production');

const dayAhead = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

test('a Rp 1 booking hands over to the DOKU payment page', async ({ page }) => {
  const day = dayAhead(3);
  await page.goto(`/search?origin=Padang%20Bai&destination=Senggigi&date=${day}&passengers=1`);

  const oneRupiah = page.getByRole('link', { name: /^Book 1/ }).filter({ hasText: /Rp\s?1(?!\d|[.,]\d)/ });
  await expect(page.locator('body')).toContainText('Rp 1', { timeout: 20_000 });
  await oneRupiah.first().click();
  await page.waitForURL(/\/book\//, { timeout: 15_000 });

  await page.locator('#passengerName-0').fill('E2E Passenger');
  await page.locator('#customerName').fill('E2E Customer');
  await page.locator('#customerEmail').fill('e2e-doku-one-rupiah@example.invalid');
  await page.getByPlaceholder('812 3456 7890').fill('8123456789');
  await page.locator('input[name="agreedToTerms"]').check();
  await expect(page.getByRole('button', { name: /^Pay\s+Rp\s?1$/ })).toBeVisible();
  await page.getByRole('button', { name: /^Pay\s/ }).click();

  await page.waitForURL(/\/pay\//, { timeout: 30_000 });
  // A mock checkout here means the DOKU keys are missing from this environment.
  await expect(page.getByText('TEST MODE')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Pay\s+Rp\s?1$/ })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: /^Pay\s+Rp\s?1$/ }).click();

  await page.waitForURL(/doku\.com/, { timeout: 45_000 });
  expect(new URL(page.url()).hostname).toMatch(/doku\.com$/);
});

test('a Rp 2 round trip (Rp 1 each way) hands over to the DOKU payment page', async ({ page }) => {
  await page.goto(
    `/search?origin=Padang%20Bai&destination=Senggigi&date=${dayAhead(3)}&returnDate=${dayAhead(5)}&passengers=1`,
  );
  await expect(page.getByRole('heading', { name: 'Outbound' })).toBeVisible({ timeout: 20_000 });

  const pick = (heading: string) =>
    page.getByRole('heading', { name: heading }).locator('xpath=following-sibling::*[1]').getByRole('button').first();
  await pick('Outbound').click();
  await pick('Return').click();
  await page.getByRole('link', { name: 'Continue to Booking' }).click();
  await page.waitForURL(/\/book\//, { timeout: 15_000 });

  await page.locator('#passengerName-0').fill('E2E Passenger');
  await page.locator('#customerName').fill('E2E Customer');
  await page.locator('#customerEmail').fill('e2e-doku-one-rupiah@example.invalid');
  await page.getByPlaceholder('812 3456 7890').fill('8123456789');
  await page.locator('input[name="agreedToTerms"]').check();

  const row = (label: string, amount: string) =>
    page.locator('div.flex.justify-between').filter({ hasText: label }).filter({ hasText: amount });
  await expect(row('Outbound', 'Rp 1').first()).toBeVisible();
  await expect(row('Return', 'Rp 1').first()).toBeVisible();
  await expect(row('Total', 'Rp 2').first()).toBeVisible();
  await page.getByRole('button', { name: /^Pay\s+Rp\s?2$/ }).click();

  await page.waitForURL(/\/pay\//, { timeout: 30_000 });
  await expect(page.getByText('TEST MODE')).toHaveCount(0);
  await page.getByRole('button', { name: /^Pay\s+Rp\s?2$/ }).click();
  await page.waitForURL(/doku\.com/, { timeout: 45_000 });
});
