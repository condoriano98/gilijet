import { test, expect, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow } from './support/overflow';
import { FIRST_VISIT_SIZES } from './support/first-visit';

/**
 * Baseline for the content and legal pages before and after their redesign
 * (stage 5): about, contact, blog list and article, best price, terms, privacy,
 * refunds and change plans. Every spec starts as a first-time visitor (no consent
 * cookie, banner open). Read only: nothing is written to the database, so there
 * are no fixtures. Case IDs are in the QA matrix.
 *
 *  CONT-040 first visit: one h1 and no sideways scroll, laptop and phone
 *  CONT-041 every internal link in the page body answers below 400
 *  CONT-042 each page has its own tab title (best-price is CONT-003b, not here)
 *  CONT-043 legal text: every section heading is still there, same words, same order
 *  CONT-044 legal text: the body keeps its word count (within 2 percent)
 *
 * Not written: a 44 px floor for links and buttons at 375 px. The links in these
 * pages are inline links inside paragraphs (exempt from a tap-size floor), and no
 * standalone button exists in the original markup, so no failure could be shown
 * by reading it.
 */
const ROUTES = [
  '/about',
  '/contact',
  '/blog',
  '/blog/wahana-virendra-checkin-guide',
  '/best-price-guarantee',
  '/terms',
  '/privacy',
  '/refunds',
  '/change-plans',
] as const;

const DEFAULT_TITLE = 'Gilifast · Fast Boat Tickets'; // `TAB_TITLE` in src/app/layout.tsx

/**
 * Section headings of the three legal pages as they rendered BEFORE the redesign
 * (the h2 and h3 of `page.tsx` at commit 6430347, React `renderToStaticMarkup`,
 * text content with the number written as "N. Title"). The h1 is not listed: a
 * redesign may re-title it. Extra headings (a table of contents title, "Contents")
 * are allowed; a missing, reworded or reordered heading is not.
 */
const LEGAL_HEADINGS: Record<string, string[]> = {
  '/terms': [
    '1. Definitions',
    '2. About gilifast.com',
    '3. Booking & Payment',
    '4. Check-in & Boarding',
    '5. Cancellation & Refund Policy',
    '6. Luggage & Personal Belongings',
    '7. Passenger Responsibilities & Conduct',
    '8. Safety Standards',
    '9. Intellectual Property & Website Use',
    '10. Privacy & Data',
    '11. Limitation of Liability',
    '12. Chargebacks & Payment Disputes',
    '13. Modifications to Terms',
    '14. Governing Law & Dispute Resolution',
    '15. Contact Information',
  ],
  '/privacy': [
    '1. Data We Collect',
    '2. How We Use Your Data',
    '3. Who We Share With',
    '4. Data Retention',
    '5. Your Rights (UU PDP)',
    '6. Security',
    '7. Cookies',
    '8. Children',
    '9. Changes',
    '10. Contact',
  ],
  '/refunds': [
    '1. About this policy',
    '2. Cancellations & refunds',
    'How the refund amount is calculated',
    'How to request a refund',
    'How long until the money arrives',
    '3. When the operator cancels',
    '4. Rescheduling your trip',
    'Reschedule Credit — what to know',
    '5. No-shows',
    '6. Refund method',
    '7. Payment disputes',
    '8. Contact us',
  ],
};

/**
 * Words in the body of each legal page before the redesign. Counted once from the
 * same HEAD render as the headings: block-level tags (p, li, ul, div, section, h1 to
 * h6, tr, td, br) as line breaks, inline tags (a, strong, em, span, b, i, code,
 * small, u) joined to their neighbours, entities decoded, split on whitespace. That
 * is what `main.innerText.split(/\s+/)` gives in a browser, so the page's own count
 * is taken the same way, minus the text inside any `nav` or `aside` in `main` (a
 * table of contents repeats headings and is not legal text).
 */
const LEGAL_WORDS: Record<string, number> = {
  '/terms': 2351,
  '/privacy': 621,
  '/refunds': 1149,
};
const WORD_TOLERANCE = 0.02;

/** "1Definitions", "1 Definitions" and "1. Definitions" are the same heading. */
const normalise = (heading: string) =>
  heading.replace(/\s+/g, ' ').trim().replace(/^(\d+)\.?\s*/, '$1. ');

async function headingsOf(page: Page): Promise<string[]> {
  const raw = await page.locator('main h1, main h2, main h3, main h4').evaluateAll((els) =>
    els.map((el) => el.textContent ?? ''),
  );
  return raw.map(normalise);
}

test.describe('content pages, first visit', () => {
  for (const route of ROUTES) {
    for (const size of FIRST_VISIT_SIZES) {
      test(`CONT-040 ${route} at ${size.name}: one h1 and no sideways scroll`, async ({ page }) => {
        await page.setViewportSize({ width: size.width, height: size.height });
        await page.goto(route);
        await expect(page.getByTestId('consent-banner')).toBeVisible({ timeout: 15_000 });
        await expect(page.getByRole('heading', { level: 1 }), `${route} has exactly one h1`).toHaveCount(1);
        await expectNoHorizontalOverflow(page);
      });
    }

    test(`CONT-041 ${route}: every internal link in the page body answers below 400`, async ({ page }) => {
      await page.goto(route);
      const hrefs = await page
        .locator('main a[href]')
        .evaluateAll((els) => els.map((el) => el.getAttribute('href') ?? ''));
      const internal = Array.from(
        new Set(hrefs.filter((h) => h.startsWith('/') && !h.startsWith('//')).map((h) => h.split('#')[0] || '/')),
      );
      expect(internal.length, `${route} links somewhere on this site`).toBeGreaterThan(0);
      for (const href of internal) {
        const res = await page.request.get(href);
        expect(res.status(), `${route} links to ${href}`).toBeLessThan(400);
      }
    });
  }

  // /best-price-guarantee has no title of its own today: known gap CONT-003b, not repeated here.
  for (const route of ROUTES.filter((r) => r !== '/best-price-guarantee')) {
    test(`CONT-042 ${route}: has its own tab title`, async ({ page }) => {
      await page.goto(route);
      const title = await page.title();
      expect(title, `${route} title`).not.toBe(DEFAULT_TITLE);
      expect(title.endsWith(' · Gilifast'), `${route} title "${title}" ends with the site name`).toBe(true);
      expect(title.split('Gilifast').length - 1, `${route} title carries the site name once`).toBe(1);
    });
  }
});

test.describe('legal pages keep their text', () => {
  for (const [route, expected] of Object.entries(LEGAL_HEADINGS)) {
    test(`CONT-043 ${route}: every section heading is still there, in the same order`, async ({ page }) => {
      await page.goto(route);
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
      const found = await headingsOf(page);
      let from = 0;
      const missing: string[] = [];
      const misplaced: string[] = [];
      for (const heading of expected) {
        const at = found.indexOf(heading, from);
        if (at >= 0) {
          from = at + 1;
        } else if (found.includes(heading)) {
          misplaced.push(heading);
        } else {
          missing.push(heading);
        }
      }
      expect.soft(missing, `${route}: headings that are missing or reworded`).toEqual([]);
      expect.soft(misplaced, `${route}: headings that moved out of order`).toEqual([]);
    });
  }

  for (const [route, before] of Object.entries(LEGAL_WORDS)) {
    test(`CONT-044 ${route}: the body keeps its ${before} words (within 2 percent)`, async ({ page }) => {
      await page.goto(route);
      const { total, skipped } = await page.evaluate(() => {
        const count = (t: string) => t.split(/\s+/).filter(Boolean).length;
        const main = document.querySelector('main')!;
        const aside = Array.from(main.querySelectorAll('nav, aside')).reduce(
          (n, el) => n + count((el as HTMLElement).innerText),
          0,
        );
        return { total: count(main.innerText), skipped: aside };
      });
      const now = total - skipped;
      expect(
        Math.abs(now - before) / before,
        `${route} has ${now} words, it had ${before} (nav and aside text, ${skipped} words, is not counted)`,
      ).toBeLessThanOrEqual(WORD_TOLERANCE);
    });
  }
});
