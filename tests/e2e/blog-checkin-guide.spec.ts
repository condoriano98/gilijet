import { test, expect } from '@playwright/test';

/**
 * The Wahana Virendra check-in guide is static content (src/content/blog), so
 * this spec needs no fixtures and writes nothing. It checks the blog index
 * links to it, that the post shows all seven harbours with a Maps link, and
 * that the page does not scroll sideways on a phone-width viewport.
 */
const SLUG = 'wahana-virendra-checkin-guide';
const HARBOURS = [
  'Sanur Beach Harbour',
  'Nusa Penida · Banjar Nyuh',
  'Padang Bai',
  'Gili Trawangan',
  'Gili Air',
  'Senggigi',
  'Bangsal',
];

test('the blog index lists the check-in guide', async ({ page }) => {
  await page.goto('/blog');
  await expect(page.locator(`a[href$="/blog/${SLUG}"]`).first()).toBeVisible();
});

test('the guide shows all seven harbours, each with a Maps link', async ({ page }) => {
  await page.goto(`/blog/${SLUG}`);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/check in/i);
  for (const name of HARBOURS) {
    await expect(page.getByRole('heading', { level: 3, name })).toBeVisible();
  }
  const maps = page.locator('a[href^="https://maps.app.goo.gl/"]');
  await expect(maps).toHaveCount(HARBOURS.length);
  await expect(page.getByText('Bangsal').first()).toBeVisible();
  await expect(page.getByText('IDR 35,000').first()).toBeVisible();
});

test('the guide does not scroll sideways on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 851 });
  await page.goto(`/blog/${SLUG}`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const { scroll, client } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(scroll).toBeLessThanOrEqual(client);
});
