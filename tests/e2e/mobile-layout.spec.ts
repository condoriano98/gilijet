import { test, expect } from '@playwright/test';

/**
 * A page wider than the phone is a whole-site failure, not a cosmetic one: the
 * browser shrinks the document to fit, so every page renders zoomed out with a
 * dead gutter down one side. That is what a header rendering its full desktop
 * nav at every width did to this site, and nothing in the suite noticed.
 *
 * Runs under the `mobile` project in playwright.config.ts. Needs `pnpm seed:qa`
 * for the routes that read the database.
 */

const PAGES = [
  { path: '/', name: 'homepage' },
  { path: '/search?origin=Sanur&destination=Nusa+Penida&passengers=1', name: 'search' },
  { path: '/b', name: 'find booking' },
  { path: '/blog', name: 'blog' },
  { path: '/contact', name: 'contact' },
];

for (const { path, name } of PAGES) {
  test(`${name} does not scroll sideways on a phone`, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator('header').first()).toBeVisible({ timeout: 15_000 });

    const { scroll, client, widest } = await page.evaluate(() => {
      const root = document.documentElement;
      // Name the widest offender, so a failure says which element to fix
      // rather than just that the number is wrong.
      let widest = '';
      let max = 0;
      for (const el of Array.from(document.body.querySelectorAll('*'))) {
        const r = el.getBoundingClientRect();
        if (r.right > max) {
          max = r.right;
          widest = `${el.tagName.toLowerCase()}.${(el.className || '').toString().slice(0, 80)}`;
        }
      }
      return { scroll: root.scrollWidth, client: root.clientWidth, widest };
    });

    expect(
      scroll,
      `${name} overflows by ${scroll - client}px — widest element: ${widest}`,
    ).toBeLessThanOrEqual(client + 1);
  });
}

test('the mobile menu reaches the links the header hides', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('header').first()).toBeVisible({ timeout: 15_000 });

  // Without this the overflow assertions above would also pass on a header that
  // had simply dropped the links instead of relocating them.
  await expect(page.getByRole('link', { name: 'Book now' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Find booking' })).toBeHidden();

  await page.getByRole('button', { name: 'Open menu' }).click();
  await expect(page.getByRole('link', { name: 'Find booking' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Blog' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
});

test('the departure and destination ports are stacked, full width, and not truncated', async ({ page }) => {
  await page.goto('/');
  const ports = page.getByRole('combobox');
  await expect(ports).toHaveCount(2, { timeout: 15_000 });
  const [from, to] = [ports.nth(0), ports.nth(1)];

  // The stacked layout exists so the full port name fits: each control spans the
  // form, and the second sits below the first rather than beside it.
  const [a, b] = [await from.boundingBox(), await to.boundingBox()];
  expect(a && b).toBeTruthy();
  expect(a!.width).toBeGreaterThan(280);
  expect(Math.abs(a!.width - b!.width)).toBeLessThan(2);
  expect(b!.y).toBeGreaterThan(a!.y + a!.height);

  // Pick the longest port name on offer: it must still fit inside its control.
  await from.click();
  const options = page.getByRole('option');
  const longest = await options.evaluateAll((els) =>
    els.reduce((best, el, i) => ((el.textContent ?? '').length > (els[best].textContent ?? '').length ? i : best), 0),
  );
  await options.nth(longest).click();
  const fits = await from.evaluate((el) => el.scrollWidth <= el.clientWidth + 1);
  expect(fits).toBe(true);
});
