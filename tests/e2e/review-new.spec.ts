import { test, expect } from '@playwright/test';

/**
 * /reviews/new is for a logged-in customer who owns a finished booking. A
 * visitor with no session must be sent to the login page, whatever the query
 * says. Reads only; writes nothing. The logged-in redirects (booking_missing,
 * not_your_booking, trip_not_finished, ...) need a customer fixture and are
 * listed in the QA matrix as CONT-030. Case IDs are in the QA matrix.
 */
test.describe('review page without a session', () => {
  test('CONT-029 anonymous visitor is sent to login', async ({ page }) => {
    await page.goto('/reviews/new?bookingId=does-not-exist');
    await expect(page).toHaveURL(/\/account\/login/);
  });

  test.fixme('CONT-029b the login page reached from here has an h1', async ({ page }) => {
    // App finding, found by the first baseline run: the sign-in title is not an h1.
    await page.goto('/reviews/new?bookingId=does-not-exist');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('CONT-029 anonymous visitor without a booking id is sent to login too', async ({ page }) => {
    await page.goto('/reviews/new');
    await expect(page).toHaveURL(/\/account\/login/);
  });
});
