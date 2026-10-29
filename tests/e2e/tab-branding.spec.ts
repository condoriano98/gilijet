import { test, expect } from '@playwright/test';

/**
 * The browser tab: a short title with the suffix once, and an icon that
 * actually loads. Reads only; writes nothing.
 */
test('customer pages: short default title, suffix once', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Gilifast · Fast Boat Tickets');
  await page.goto('/about');
  await expect(page).toHaveTitle('About · Gilifast');
  await page.goto('/refunds');
  await expect(page).toHaveTitle('Refund & Reschedule Policy · Gilifast');
});

test('operator and admin tabs say which console they are', async ({ page }) => {
  await page.goto('/operator/login');
  await expect(page).toHaveTitle('Operator · Gilifast');
  await page.goto('/admin/login');
  await expect(page).toHaveTitle('Admin · Gilifast');
});

test('the tab icon and the home-screen icon are served as PNG', async ({ page }) => {
  await page.goto('/');
  for (const rel of ['icon', 'apple-touch-icon']) {
    const href = await page.locator(`link[rel="${rel}"]`).first().getAttribute('href');
    expect(href, `link rel=${rel}`).toBeTruthy();
    const res = await page.request.get(href!);
    expect(res.status(), rel).toBe(200);
    expect(res.headers()['content-type'], rel).toContain('image/png');
  }
});
