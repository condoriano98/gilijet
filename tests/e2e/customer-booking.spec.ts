import { test, expect } from "@playwright/test";

/**
 * Golden path: an anonymous customer lands on the homepage, searches for a
 * route, picks one of the QA schedules, fills the guest form, mock-pays, and
 * lands on a booking page telling them their seat is being confirmed.
 *
 * Paying no longer produces a boarding pass — an admin has to reach the
 * operator first — so the QR code is deliberately absent at this point.
 *
 * Relies on `pnpm seed:qa` having been run — see scripts/seed-qa.ts.
 */
test("anonymous customer can book a QA schedule end-to-end", async ({
  page,
}) => {
  const tomorrow = new Date(Date.now() + 86_400_000);
  const y = tomorrow.getFullYear();
  const m = String(tomorrow.getMonth() + 1).padStart(2, "0");
  const d = String(tomorrow.getDate()).padStart(2, "0");
  const date = `${y}-${m}-${d}`;

  await page.goto(`/search?origin=Sanur&destination=Nusa+Penida&date=${date}&passengers=1`);
  await expect(page.locator("h1").first()).toBeVisible({ timeout: 15_000 });

  await page.getByRole("link", { name: /Book \d/i }).first().click({ timeout: 10_000 });

  await page.waitForURL(/\/book\//, { timeout: 15_000 });
  await expect(page.getByText(/passenger|penumpang/i).first()).toBeVisible();

  await page.getByLabel("Passenger 1 name").fill("QA Tester");
  await page.getByLabel("Your name").fill("QA Tester");
  await page.getByLabel("Email").fill("qa-walk@gilifast.local");
  await page.getByPlaceholder("812 3456 7890").fill("8123456789");
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
  await expect(page.locator("body")).toContainText(
    /confirming your seat|payment received/i,
  );
  // The boarding pass is issued by an admin, not by payment, so no QR yet.
  await expect(page.getByAltText(/QR code for ticket/i)).toHaveCount(0);
});
