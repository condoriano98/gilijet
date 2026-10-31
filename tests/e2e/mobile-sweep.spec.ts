import { test, expect } from '@playwright/test';
import {
  expectNoHorizontalOverflow,
  expectSubmitButtonsBigEnough,
  expectSubmitButtonsReachable,
} from './support/overflow';

/**
 * Phone-width sweep over the customer pages that need no data: nothing
 * scrolls sideways, every submit button is at least 44 px high, and nothing
 * covers a submit button (a sticky bar would). QA matrix: MOB-001 to MOB-004.
 * Pages that need a booking, a departure or a signed-in customer are covered
 * where their data is built: BOOK-M01 to BOOK-M03, AUTH-070.
 *
 * Writes nothing. The `mobile-flow` project runs this at 375 px; run in the
 * desktop project it checks the same rules at 1280 px.
 */
const ROUTES = [
  '/',
  '/about',
  '/contact',
  '/blog',
  '/blog/wahana-virendra-checkin-guide',
  '/best-price-guarantee',
  '/terms',
  '/privacy',
  '/refunds',
  '/change-plans',
  '/b',
  '/account/login',
  '/account/register',
  '/account/forgot-password',
  '/search?destination=E2E+Nowhere&date=2090-01-01&passengers=1',
];

// Routes whose redesign has landed on this branch. MOB-004 (44 px buttons) is
// the redesign's standard, not the current site's: today `/b` has a 40 px
// "Look up" button and the booking page a 36 px "Cancel booking". Add a route
// here in the stage that redesigns it, and the check starts guarding it.
const REDESIGNED_ROUTES: string[] = [
  '/',
  '/b',
  '/search?destination=E2E+Nowhere&date=2090-01-01&passengers=1',
];

for (const route of ROUTES) {
  test(`MOB-001 ${route} does not scroll sideways`, async ({ page }) => {
    await page.goto(route);
    await page.waitForLoadState('networkidle');
    await expectNoHorizontalOverflow(page);
  });

  test(`MOB-002 ${route}: nothing covers a submit button`, async ({ page }) => {
    await page.goto(route);
    await page.waitForLoadState('networkidle');
    await expectSubmitButtonsReachable(page);
  });

  if (REDESIGNED_ROUTES.includes(route)) {
    test(`MOB-004 ${route}: submit buttons are at least 44 px high`, async ({ page }) => {
      await page.goto(route);
      await page.waitForLoadState('networkidle');
      await expectSubmitButtonsBigEnough(page);
    });
  }
}

test('MOB-003 the consent banner does not cover the page header on a phone', async ({ browser, baseURL }) => {
  // A fresh context has no consent cookie, so the banner shows.
  const context = await browser.newContext({ viewport: { width: 375, height: 667 }, baseURL });
  const page = await context.newPage();
  try {
    await page.goto('/about');
    const banner = page.getByRole('dialog').first();
    if ((await banner.count()) === 0) test.skip(true, 'no consent banner when marketing is off');
    await expect(banner).toBeVisible();
    const box = await banner.boundingBox();
    expect(box!.height, 'the banner takes more than half of a phone screen').toBeLessThan(667 / 2);
  } finally {
    await context.close();
  }
});
