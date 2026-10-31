import { test, expect, type Page } from '@playwright/test';

/**
 * The From and To dropdowns of the search form, on the home page and on
 * /search, as a visitor meets them. Two blind spots this file closes:
 *  - the visitor's first visit, when the consent banner is open;
 *  - the form on /search (only the home form had dropdown tests).
 * Needs `pnpm seed:qa` (Sanur and Nusa Penida). Writes nothing. Case IDs are in
 * the QA matrix.
 */
const SEARCH = '/search?destination=Nusa+Penida&passengers=1';
const PAGES = [
  { name: 'home', url: '/' },
  { name: '/search', url: SEARCH },
  { name: 'home in Indonesian', url: '/id' },
] as const;
const SIZES = [
  { name: 'laptop 1280x720', width: 1280, height: 720 },
  { name: 'phone 375x812', width: 375, height: 812 },
] as const;

async function optionNames(page: Page, index: number): Promise<string[]> {
  await page.getByRole('combobox').nth(index).click();
  await expect(page.getByRole('option').first()).toBeVisible();
  const names = (await page.getByRole('option').allInnerTexts()).map((t) => t.trim());
  await page.keyboard.press('Escape');
  await expect(page.getByRole('option')).toHaveCount(0);
  return names;
}

test.describe('search form dropdowns', () => {
  for (const p of PAGES) {
    for (const size of SIZES) {
      test(`CONT-033 ${p.name} at ${size.name}: From and To open and list the same ports`, async ({ page }) => {
        await page.setViewportSize({ width: size.width, height: size.height });
        await page.goto(p.url);
        await expect(page.getByRole('combobox')).toHaveCount(2, { timeout: 15_000 });
        const from = await optionNames(page, 0);
        const to = await optionNames(page, 1);
        expect(from.length, 'From lists ports').toBeGreaterThan(0);
        expect(to.length, 'To lists ports').toBeGreaterThan(0);
        expect(to, 'the two lists are the same ports in the same order').toEqual(from);
        for (const port of ['Sanur', 'Nusa Penida']) {
          expect(from.some((n) => n.startsWith(`${port} - `)), `${port} is offered`).toBe(true);
        }
      });
    }
  }

  test('CONT-034 /search: picking a port in From and To fills both fields', async ({ page }) => {
    await page.goto(SEARCH);
    await expect(page.getByRole('combobox')).toHaveCount(2, { timeout: 15_000 });
    await page.getByRole('combobox').nth(0).click();
    await page.getByRole('option', { name: /^Sanur - / }).click();
    await expect(page.getByRole('combobox').nth(0)).toContainText('Sanur');
    await expect(page.getByRole('combobox').nth(1)).toContainText('Nusa Penida');
  });
});

// Every spec starts as a first-time visitor (no saved consent choice), so the banner is open.
test.describe('search form on a first visit (consent banner open)', () => {
  for (const p of PAGES) {
    for (const size of SIZES) {
      test(`CONT-035 ${p.name} at ${size.name}: the banner does not cover From or To when the page opens`, async ({ page }) => {
        // Known bug B14: at first sight the fixed banner covers the To field (all of it on a
        // phone, its right half on a laptop). Flips to a failure the day it is fixed.
        test.fail(true, 'B14: the consent banner covers the search form on a first visit');
        await page.setViewportSize({ width: size.width, height: size.height });
        await page.goto(p.url);
        await expect(page.getByTestId('consent-banner')).toBeVisible({ timeout: 15_000 });
        await expect(page.getByRole('combobox')).toHaveCount(2, { timeout: 15_000 });
        for (const index of [0, 1]) {
          const label = index === 0 ? 'From' : 'To';
          const hit = await page.getByRole('combobox').nth(index).evaluate((el) => {
            const r = el.getBoundingClientRect();
            const x = Math.min(Math.max(r.left + r.width / 2, 0), innerWidth - 1);
            const y = r.top + r.height / 2;
            if (y < 0 || y >= innerHeight) return 'offscreen';
            const top = document.elementFromPoint(x, y);
            return top && (top === el || el.contains(top)) ? 'self' : (top?.closest('[data-testid]')?.getAttribute('data-testid') ?? top?.tagName.toLowerCase() ?? 'nothing');
          });
          expect.soft(['self', 'offscreen'], `${label} field is covered by ${hit}`).toContain(hit);
        }
      });
    }
  }

  test('CONT-036 the form still works after the banner is answered', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    await page.getByTestId('consent-banner').getByRole('button', { name: 'Essential only' }).click();
    await expect(page.getByTestId('consent-banner')).toBeHidden();
    await expect(page.getByRole('combobox')).toHaveCount(2, { timeout: 15_000 });
    await page.getByRole('combobox').nth(1).click();
    await expect(page.getByRole('option').first()).toBeVisible();
  });
});
