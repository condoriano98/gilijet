import { test, expect } from "@playwright/test";

test("admin can log in and view the refunds queue", async ({ page }) => {
  await page.goto("/admin/login");

  await page.getByLabel(/email/i).fill("qa-admin@gilifast.local");
  await page.getByLabel(/password/i).fill("qaqaqaqa");
  await page.getByRole("button", { name: /log ?in|sign ?in/i }).click();

  await page.waitForURL(/\/admin(\/|$)/, { timeout: 20_000 });
  await page.waitForTimeout(2000);
  await page.reload();

  await page.goto("/admin/refunds");
  await expect(page.locator("body")).toContainText(/refund/i, { timeout: 15_000 });
  await expect(page.locator("body")).toContainText(/pending|approve|qa-customer/i, { timeout: 5_000 });
});
