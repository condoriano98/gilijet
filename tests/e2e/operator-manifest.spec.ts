import { test, expect } from "@playwright/test";

test("operator can log in and view a leg manifest", async ({ page }) => {
  await page.goto("/operator/login");

  await page.getByLabel(/email/i).fill("qa-operator@gilifast.local");
  await page.getByLabel(/password/i).fill("qaqaqaqa");
  await page.getByRole("button", { name: /log ?in|sign ?in/i }).click();

  await page.waitForURL(/\/operator(\/|$)/, { timeout: 15_000 });
  // The operator dashboard is a hardcoded Indonesian UI — the operator email
  // greeting is what proves the login actually landed.
  await expect(page.locator("body")).toContainText(/qa-operator/i);

  await page.goto("/operator/legs");
  await expect(page.locator("h1")).toContainText(/departures/i, {
    timeout: 15_000,
  });
  const firstLeg = page.getByRole("link", { name: /manifest/i }).first();
  if (await firstLeg.isVisible().catch(() => false)) {
    await firstLeg.click();
    await expect(page.locator("body")).toContainText(/passenger|ticket|seat/i);
  }
});
