import { test, expect } from "@playwright/test";

/**
 * Golden path: an anonymous customer lands on the homepage, searches for a
 * route, picks one of the QA schedules, fills the guest form, mock-pays,
 * and lands on a ticket page with a QR code.
 *
 * Relies on `pnpm seed:qa` having been run — see scripts/seed-qa.ts.
 */
test("anonymous customer can book a QA schedule end-to-end", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/gilibali|gilijet/i);

  await expect(
    page.getByRole("link", { name: /search|find|book/i }).first(),
  ).toBeVisible();

  await page.goto("/search?origin=Sanur&destination=Nusa+Penida");
  await expect(page.locator("h1").first()).toBeVisible({ timeout: 15_000 });

  await page.getByRole("link", { name: /Book \d/i }).first().click({ timeout: 10_000 });

  await page.waitForURL(/\/book\//, { timeout: 15_000 });
  await expect(page.getByText(/passenger|penumpang/i).first()).toBeVisible();

  await page.getByLabel(/name/i).first().fill("QA Tester");
  await page.getByLabel(/email/i).first().fill("qa-walk@gilijet.local");
  await page.getByLabel(/phone|whatsapp/i).first().fill("+628123456789");

  await page.getByRole("button", { name: /continue|book|pay/i }).first().click();

  await page.waitForURL(/\/(b|tickets?|account\/bookings)\//, {
    timeout: 30_000,
  });
  await expect(page.locator("body")).toContainText(/ticket|booking|qr/i);
});
