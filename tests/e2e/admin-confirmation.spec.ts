import { test, expect } from "@playwright/test";

/**
 * Golden path continuation of customer-booking.spec.ts: an anonymous customer
 * reserves and mock-pays a QA schedule, then an admin confirms availability at
 * /admin/confirmations. Only after that approval should the e-ticket (QR +
 * boarding-pass PDF) appear on the customer's booking page.
 *
 * Relies on `pnpm seed:qa` having been run — see scripts/seed-qa.ts.
 */
test("admin confirming a paid booking issues the e-ticket", async ({
  page,
}) => {
  const tomorrow = new Date(Date.now() + 86_400_000);
  const y = tomorrow.getFullYear();
  const m = String(tomorrow.getMonth() + 1).padStart(2, "0");
  const d = String(tomorrow.getDate()).padStart(2, "0");
  const date = `${y}-${m}-${d}`;

  // ---- Customer: reserve + mock-pay ----
  await page.goto(`/search?origin=Sanur&destination=Nusa+Penida&date=${date}&passengers=1`);
  await expect(page.locator("h1").first()).toBeVisible({ timeout: 15_000 });

  await page.getByRole("link", { name: /Book \d/i }).first().click({ timeout: 10_000 });

  await page.waitForURL(/\/book\//, { timeout: 15_000 });
  await expect(page.getByText(/passenger|penumpang/i).first()).toBeVisible();

  await page.getByLabel("Passenger 1 name").fill("QA Confirm Tester");
  await page.getByLabel("Your name").fill("QA Confirm Tester");
  await page.getByLabel("Email").fill("qa-confirm@gilifast.local");
  await page.getByPlaceholder("812 3456 7890").fill("8123456780");
  await page.getByRole("checkbox").check();

  await page.getByRole("button", { name: /continue|book|pay/i }).first().click();

  await page.waitForURL(/\/(checkout|b|tickets?|account\/bookings)\//, {
    timeout: 30_000,
  });

  const checkoutCheckbox = page.getByRole("checkbox");
  if (await checkoutCheckbox.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await checkoutCheckbox.check();
    await page.getByRole("button", { name: /^Pay\s/ }).click();
    await page.waitForURL(/\/(b|tickets?|account\/bookings)\//, { timeout: 30_000 });
  }

  const bookingUrl = page.url();
  const reference = bookingUrl.match(/\/b\/([^/?#]+)/)?.[1];
  expect(reference, `expected a /b/{reference} URL, got ${bookingUrl}`).toBeTruthy();

  await expect(page.locator("body")).toContainText(
    /confirming your seat|payment received/i,
  );
  // Not issued yet — payment alone never mints a ticket.
  await expect(page.getByAltText(/QR code for ticket/i)).toHaveCount(0);
  await expect(page.getByRole("link", { name: /boarding pass pdf/i })).toHaveCount(0);

  // ---- Admin: log in and approve the booking ----
  await page.goto("/admin/login");
  await page.getByLabel(/email/i).fill("qa-admin@gilifast.local");
  await page.getByLabel(/password/i).fill("qaqaqaqa");
  await page.getByRole("button", { name: /log ?in|sign ?in/i }).click();
  await page.waitForURL(/\/admin(\/|$)/, { timeout: 20_000 });
  await page.waitForTimeout(2000);
  await page.reload();

  await page.goto("/admin/confirmations");
  await expect(page.locator("body")).toContainText(/awaiting confirmation/i, {
    timeout: 15_000,
  });

  const row = page.getByRole("row").filter({ hasText: reference! });
  await expect(row).toBeVisible({ timeout: 10_000 });
  await row.getByRole("button", { name: /confirmed.*send pass/i }).click();

  await page.waitForURL(/\/admin\/confirmations\?ok=/, { timeout: 15_000 });
  await expect(page.locator("body")).toContainText(/boarding pass issued/i);

  // ---- Customer: the e-ticket is now visible ----
  await page.goto(`/b/${reference}`);
  await expect(page.getByAltText(/QR code for ticket/i).first()).toBeVisible({
    timeout: 10_000,
  });
  await expect(
    page.getByRole("link", { name: /boarding pass pdf/i }),
  ).toHaveAttribute("href", `/api/bookings/${reference}/boarding-pass`);
});
