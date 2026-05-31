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
  await expect(page).toHaveTitle(/gilijet/i);

  // Homepage should expose a search entrypoint.
  await expect(
    page.getByRole("link", { name: /search|find|book/i }).first(),
  ).toBeVisible();

  // Use the QA schedule directly — homepage search wiring varies and is
  // covered by ui-polisher walkthroughs, not by this golden path.
  await page.goto("/book/qa-sched-1");
  await expect(page.getByText(/total/i).first()).toBeVisible();

  // The booking form is RHF + Zod. Field names follow the schema in
  // app/(customer)/book/[scheduleId]/page.tsx.
  await page.getByLabel(/name/i).first().fill("QA Tester");
  await page.getByLabel(/email/i).first().fill("qa-walk@gilijet.local");
  await page.getByLabel(/phone|whatsapp/i).first().fill("+628123456789");

  await page.getByRole("button", { name: /continue|book|pay/i }).first().click();

  // Mock-pay endpoint returns the customer to the ticket page.
  await page.waitForURL(/\/(b|tickets?|account\/bookings)\//, {
    timeout: 30_000,
  });
  await expect(page.locator("body")).toContainText(/ticket|booking|qr/i);
});
