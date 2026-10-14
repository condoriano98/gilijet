import { test, expect, type Page } from '@playwright/test';
import { loadEnvConfig } from '@next/env';
import { livePaymentKeys } from './payment-keys';

loadEnvConfig(process.cwd());

/**
 * Specs that open the checkout page or pay must run against mock gateways.
 * Local env files can hold production DOKU, PayPal, WATI and Resend keys, and
 * opening checkout with a live DOKU key creates a real payment session. Call
 * this at the top of the spec file: with any live key set the whole file is
 * skipped before a single page is opened or a row is written.
 *
 * Run them with the keys blanked, e.g.
 *   DOKU_CLIENT_ID= DOKU_SECRET_KEY= PAYPAL_CLIENT_ID= PAYPAL_CLIENT_SECRET= \
 *   WATI_API_KEY= RESEND_API_KEY= pnpm test:e2e
 */
export function requireMockPayments() {
  const live = livePaymentKeys(process.env);
  test.skip(live.length > 0, `refusing to run with live payment/messaging keys set: ${live.join(', ')}`);
}

/**
 * Pay on the mock checkout page. Asserts the page says TEST MODE *before* the
 * terms box is ticked and Pay is clicked, so a misconfigured environment fails
 * instead of paying.
 */
export async function payInMockMode(page: Page) {
  await expect(page.getByText('TEST MODE')).toBeVisible({ timeout: 15_000 });
  await page.locator('input[type="checkbox"], [role="checkbox"]').first().check();
  await page.getByRole('button', { name: /^Pay\s/ }).click();
}
