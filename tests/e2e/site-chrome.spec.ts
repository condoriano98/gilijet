import { test, expect, type Page } from '@playwright/test';
import { saveEssentialOnlyChoice } from './support/consent';

/**
 * The header, footer, consent banner, 404 and locale prefixes that wrap every
 * customer page. Reads only; writes nothing. Case IDs are in the QA matrix.
 * The consent banner's choices are covered by marketing-consent.spec.ts and the
 * phone menu by mobile-layout.spec.ts.
 */

async function internalHrefs(page: Page, scope: 'header' | 'footer'): Promise<string[]> {
  const hrefs = await page
    .locator(`${scope} a[href]`)
    .evaluateAll((els) => els.map((el) => el.getAttribute('href') ?? ''));
  return Array.from(
    new Set(hrefs.filter((h) => h.startsWith('/') && !h.startsWith('//'))),
  );
}

test.describe('site chrome', () => {
  test('CONT-007 header links resolve', async ({ page }) => {
    await page.goto('/about');
    await expect(page.getByRole('link', { name: 'Blog' }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Find booking' }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Book now' }).first()).toBeVisible();

    const hrefs = await internalHrefs(page, 'header');
    expect(hrefs.length).toBeGreaterThanOrEqual(3);
    for (const href of hrefs) {
      const res = await page.request.get(href);
      expect(res.status(), `header link ${href}`).toBeLessThan(400);
    }
  });

  test('CONT-009 footer links resolve', async ({ page }) => {
    await page.goto('/about');
    const hrefs = await internalHrefs(page, 'footer');
    for (const expected of [
      '/about',
      '/contact',
      '/blog',
      '/terms',
      '/privacy',
      '/refunds',
      '/b',
      '/change-plans',
    ]) {
      expect(hrefs, `footer has a link to ${expected}`).toContain(expected);
    }
    for (const href of hrefs) {
      const res = await page.request.get(href);
      expect(res.status(), `footer link ${href}`).toBeLessThan(400);
    }
  });

  test('CONT-010 WhatsApp and email links', async ({ page }) => {
    await page.goto('/about');
    await expect(
      page.locator('a[href="https://wa.me/628133399869"]').first(),
    ).toBeAttached();
    await expect(
      page.locator('a[href="mailto:info@balinusafast.com"]').first(),
    ).toBeAttached();
  });

  test('CONT-009b footer keeps cookie settings and payment partners; no utility bar above the header', async ({ page }) => {
    await page.goto('/about');
    await expect(page.locator('footer').getByRole('button', { name: 'Cookie settings' })).toBeVisible();
    await expect(page.locator('footer').getByText('Payment Partners')).toBeVisible();
    await expect(page.locator('footer').getByText(/Payments by DOKU/)).toBeVisible();
    const headerTop = await page.locator('header').first().evaluate((el) => el.getBoundingClientRect().top);
    expect(headerTop).toBe(0);
  });

  test('CONT-012 banner stays hidden after a choice', async ({ page, context, baseURL }) => {
    await saveEssentialOnlyChoice(context, baseURL!);
    await page.goto('/');
    await expect(page.locator('header').first()).toBeVisible();
    await expect(page.getByTestId('consent-banner')).toBeHidden();
  });

  test('CONT-013 unknown path is 404', async ({ page }) => {
    const res = await page.goto('/this-page-does-not-exist-qa');
    expect(res?.status()).toBe(404);
  });

  test('CONT-014 unknown locale is 404', async ({ page }) => {
    const res = await page.goto('/fr/about');
    expect(res?.status()).toBe(404);
  });

  for (const locale of ['en', 'id', 'zh', 'ja']) {
    test(`CONT-015 /${locale}/about renders`, async ({ page }) => {
      const res = await page.goto(`/${locale}/about`);
      expect(res?.status()).toBe(200);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    });
  }
});
