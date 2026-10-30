import { test, expect } from '@playwright/test';

/**
 * The home page search form: it hands the visitor to /search with the right
 * query string, refuses an incomplete form, and swaps and reveals fields.
 * Needs `pnpm seed:qa` (Sanur and Nusa Penida come from its schedules). Writes
 * nothing, so there are no fixtures to remove. Case IDs are in the QA matrix.
 */
const FROM = 'Sanur';
const TO = 'Nusa Penida';

async function pick(page: import('@playwright/test').Page, index: number, port: string) {
  await page.getByRole('combobox').nth(index).click();
  // Options read "<port> - <island>"; match the port part exactly.
  await page.getByRole('option', { name: new RegExp(`^${port} - `) }).click();
}

test.describe('home search', () => {
  test('CONT-017 hero heading and search form render', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Let Journey Begin with Gilifast!',
    );
    await expect(page.getByRole('combobox')).toHaveCount(2, { timeout: 15_000 });
    await expect(page.getByRole('button', { name: 'Search', exact: true })).toBeVisible();
    await expect(page.locator('#passengers')).toBeVisible();
  });

  test('CONT-018 search form submits to /search with its params', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('combobox')).toHaveCount(2, { timeout: 15_000 });
    await pick(page, 0, FROM);
    await pick(page, 1, TO);
    await page.getByRole('button', { name: 'Increase passengers' }).click();

    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await page.waitForURL(/\/search\?/);

    const params = new URL(page.url()).searchParams;
    expect(params.get('origin')).toBe(FROM);
    expect(params.get('destination')).toBe(TO);
    expect(params.get('passengers')).toBe('2');
    // The date picker is a button, not an input; today is its default.
    expect(params.get('date')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(params.has('returnDate')).toBe(false);
  });

  test('CONT-019 search without a destination does nothing', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('combobox')).toHaveCount(2, { timeout: 15_000 });
    // The form refuses an incomplete search by disabling the button.
    await expect(page.getByRole('button', { name: 'Search', exact: true })).toBeDisabled();
    expect(new URL(page.url()).pathname).toBe('/');
  });

  test('CONT-020 swap exchanges the ports', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('combobox')).toHaveCount(2, { timeout: 15_000 });
    await pick(page, 0, FROM);
    await pick(page, 1, TO);
    await expect(page.getByRole('combobox').nth(0)).toContainText(FROM);

    await page.getByRole('button', { name: 'Swap origin and destination' }).click();
    await expect(page.getByRole('combobox').nth(0)).toContainText(TO);
    await expect(page.getByRole('combobox').nth(1)).toContainText(FROM);
  });

  test('CONT-021 Return reveals the return date', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('combobox')).toHaveCount(2, { timeout: 15_000 });
    await expect(page.getByText('Return:')).toBeHidden();
    await page.getByRole('button', { name: 'Return', exact: true }).click();
    await expect(page.getByText('Return:')).toBeVisible();
    await page.getByRole('button', { name: 'One way' }).click();
    await expect(page.getByText('Return:')).toBeHidden();
  });

  test('CONT-022 home renders without the error boundary', async ({ page }) => {
    const res = await page.goto('/');
    expect(res?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: 'Something went wrong' })).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible();
  });
});
