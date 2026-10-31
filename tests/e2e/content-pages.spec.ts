import { test, expect } from '@playwright/test';

/**
 * Baseline for the static customer pages: each loads, has one h1 and a proper
 * tab title, and does not scroll sideways on a phone. Reads only; writes
 * nothing, so it needs no fixtures. Case IDs are in the QA matrix.
 *
 * The home page and /b read the database for some blocks; they only need the
 * database to be reachable.
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
  '/legal/wahana-virendra',
];

// The best-price page has no h1 (its title is a card heading) and exports no
// metadata, so it keeps the default tab title. See CONT-002b and CONT-003b.
const ROUTES_WITH_H1 = ROUTES.filter(
  (r) => r !== '/best-price-guarantee' && !r.startsWith('/legal/'),
);

const TITLES: Record<string, string> = {
  '/contact': 'Contact · Gilifast',
  '/blog': 'Blog · Gilifast',
  '/terms': 'Terms & Conditions · Gilifast',
  '/privacy': 'Privacy Policy · Gilifast',
  '/change-plans': 'Change my plans · Gilifast',
};

const NO_SCROLL_AT_375 = [
  '/about',
  '/best-price-guarantee',
  '/terms',
  '/privacy',
  '/refunds',
  '/change-plans',
];

test.describe('content pages', () => {
  for (const route of ROUTES) {
    test(`CONT-001 ${route} returns 200`, async ({ page }) => {
      const res = await page.goto(route);
      expect(res?.status(), route).toBe(200);
    });
  }

  for (const route of ROUTES_WITH_H1) {
    test(`CONT-002 ${route} has one h1`, async ({ page }) => {
      await page.goto(route);
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    });
  }

  // Bug B4 for /b, fixed in redesign stage 3 (the title is now an h1).
  test('CONT-002c /b (find your booking) has one h1', async ({ page }) => {
    await page.goto('/b');
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  });

  test.fixme(
    'CONT-002b best-price-guarantee has one h1',
    // App finding: the page title is a CardTitle (h3) and the page has no h1.
    async ({ page }) => {
      await page.goto('/best-price-guarantee');
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    },
  );

  for (const [route, title] of Object.entries(TITLES)) {
    test(`CONT-003 ${route} title`, async ({ page }) => {
      await page.goto(route);
      await expect(page).toHaveTitle(title);
    });
  }

  test('CONT-003 blog article title carries the suffix once', async ({ page }) => {
    await page.goto('/blog/wahana-virendra-checkin-guide');
    const title = await page.title();
    expect(title.endsWith(' · Gilifast')).toBe(true);
    expect(title.split('Gilifast').length - 1).toBe(1);
  });

  test.fixme(
    'CONT-003b best-price-guarantee has its own title',
    // App finding: no `metadata` export, so the default tab title shows.
    async ({ page }) => {
      await page.goto('/best-price-guarantee');
      await expect(page).toHaveTitle('Best Price Guarantee · Gilifast');
    },
  );

  for (const route of NO_SCROLL_AT_375) {
    test(`CONT-005 ${route} does not scroll sideways at 375`, async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 800 });
      await page.goto(route);
      await expect(page.locator('header').first()).toBeVisible({ timeout: 15_000 });

      const { scroll, client, widest } = await page.evaluate(() => {
        let widest = '';
        let max = 0;
        for (const el of Array.from(document.body.querySelectorAll('*'))) {
          const r = el.getBoundingClientRect();
          if (r.right > max) {
            max = r.right;
            widest = `${el.tagName.toLowerCase()} "${(el.textContent ?? '').trim().slice(0, 40)}"`;
          }
        }
        return {
          scroll: document.documentElement.scrollWidth,
          client: document.documentElement.clientWidth,
          widest,
        };
      });
      expect(
        scroll,
        `${route} overflows by ${scroll - client}px; widest element: ${widest}`,
      ).toBeLessThanOrEqual(client + 1);
    });
  }

  test('CONT-027 terms and privacy keep their numbered sections', async ({ page }) => {
    await page.goto('/terms');
    const termsSections = page.getByRole('heading', { level: 2, name: /^\d+\. / });
    await expect(termsSections).toHaveCount(15);
    await expect(termsSections.first()).toHaveText('1. Definitions');

    await page.goto('/privacy');
    await expect(
      page.getByRole('heading', { level: 2, name: '1. Data We Collect' }),
    ).toBeVisible();
    expect(
      await page.getByRole('heading', { level: 2, name: /^\d+\. / }).count(),
    ).toBeGreaterThanOrEqual(3);
  });
});
