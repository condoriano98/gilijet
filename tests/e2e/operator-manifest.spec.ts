import { test, expect } from "@playwright/test";

test("operator can log in and view a leg manifest", async ({ page }) => {
  await page.goto("/operator/login");

  await page.getByLabel(/email/i).fill("qa-operator@gilifast.local");
  await page.getByLabel(/password/i).fill("qaqaqaqa");
  await page.getByRole("button", { name: /log ?in|sign ?in/i }).click();

  await page.waitForURL(/\/operator(\/|$)/, { timeout: 15_000 });
  await expect(page.locator("body")).toContainText(/leg|schedule|manifest/i);

  await page.goto("/operator/legs");
  const firstLeg = page.getByRole("link", { name: /qa|sched|view|manifest/i }).first();
  if (await firstLeg.isVisible().catch(() => false)) {
    await firstLeg.click();
    await expect(page.locator("body")).toContainText(/passenger|ticket|seat/i);
  }
});
