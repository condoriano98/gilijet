import { test, expect } from '@playwright/test';

/**
 * Round-trip booking golden path: anonymous customer lands on homepage, searches
 * for a round-trip route, picks outbound + return legs from QA schedules, fills
 * passenger form (once, for both legs), mock-pays, and lands on booking confirmation
 * showing both outbound and return itineraries.
 *
 * Relies on `pnpm seed:qa` having been run — see scripts/seed-qa.ts.
 */
test.skip('anonymous customer can book a round-trip schedule end-to-end (E2E selector tuning needed)', async ({
  page,
}) => {
  // Search 7 days ahead for outbound, 9 days for return (ensures 2-day gap)
  const outboundDate = new Date(Date.now() + 7 * 86_400_000);
  const returnDate = new Date(Date.now() + 9 * 86_400_000);

  const formatDate = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const outboundStr = formatDate(outboundDate);
  const returnStr = formatDate(returnDate);

  // Go to search page with return date (triggers round-trip mode)
  // returnDate param automatically sets isRoundTrip = true
  await page.goto(
    `/search?origin=Sanur&destination=Nusa+Penida&` +
    `date=${outboundStr}&returnDate=${returnStr}&passengers=1`,
  );

  // Wait for search results to load
  await expect(page.locator('h1').first()).toBeVisible({ timeout: 15_000 });

  // Verify round-trip indicator is present (page shows "returning [date]")
  await expect(page.getByText(/returning/i)).toBeVisible({ timeout: 5_000 });

  // Pick first outbound leg
  // Button text is "Book {passengers} ·" (with bullet point)
  const bookLinks = page.locator('a').filter({ hasText: /^Book \d/ });
  const bookLinkCount = await bookLinks.count();
  expect(bookLinkCount).toBeGreaterThanOrEqual(1); // At least one outbound leg

  await bookLinks.first().click({ timeout: 10_000 });

  // Wait for booking page and verify we see round-trip structure
  await page.waitForURL(/\/book\//, { timeout: 15_000 });

  // Should see passenger form and booking details
  await expect(page.getByText(/passenger|penumpang/i).first()).toBeVisible();

  // For round-trip, both legs should be shown
  await expect(page.getByText(/outbound|berangkat/i)).toBeVisible({ timeout: 5_000 });
  await expect(page.getByText(/return|pulang/i)).toBeVisible({ timeout: 5_000 });

  // Fill passenger details (once for both legs)
  await page.getByLabel('Passenger 1 name').fill('Round Trip Tester');
  await page.getByLabel('Your name').fill('Round Trip Tester');
  await page.getByLabel('Email').fill('qa-roundtrip@gilifast.local');
  await page.getByPlaceholder('812 3456 7890').fill('8123456789');
  await page.getByRole('checkbox').check();

  // Click book/pay button
  await page.getByRole('button', { name: /continue|book|pay/i }).first().click();

  // Navigate to checkout or confirmation
  await page.waitForURL(/\/(checkout|b|tickets?|account\/bookings)\//, {
    timeout: 30_000,
  });

  // Handle payment checkbox if present
  const checkoutCheckbox = page.getByRole('checkbox');
  if (await checkoutCheckbox.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await checkoutCheckbox.check();
    await page.getByRole('button', { name: /^Pay\s/ }).click();
    await page.waitForURL(/\/(b|tickets?|account\/bookings)\//, { timeout: 30_000 });
  }

  // Verify confirmation message
  await expect(page.locator('body')).toContainText(
    /confirming your seat|payment received|booking confirmed/i,
  );

  // Verify both outbound and return are mentioned in confirmation
  await expect(page.getByText(/outbound|berangkat|departure/i)).toBeVisible({ timeout: 5_000 });
  await expect(page.getByText(/return|pulang|kembali/i)).toBeVisible({ timeout: 5_000 });

  // Verify round-trip badge/indicator in confirmation
  await expect(page.getByText(/round[\s-]trip/i)).toBeVisible({ timeout: 5_000 });
});
