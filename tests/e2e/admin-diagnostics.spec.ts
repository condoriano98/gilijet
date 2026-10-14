import { test, expect } from '@playwright/test';
import pkg from '../../package.json';

/**
 * The running build is identifiable from the admin side: /admin/diagnostics
 * shows the release version from package.json. Read-only; relies on
 * `pnpm seed:qa` for the super-admin account.
 */
test('super admin sees the running version on diagnostics', async ({ page }) => {
  await page.goto('/admin/login');
  await page.getByLabel(/email/i).fill('qa-admin@gilifast.local');
  await page.getByLabel(/password/i).fill('qaqaqaqa');
  await page.getByRole('button', { name: /log ?in|sign ?in/i }).click();
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 20_000 });

  await page.goto('/admin/diagnostics');
  await expect(page.getByText('Build', { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(`v${pkg.version}`, { exact: true })).toBeVisible();
  await expect(page.getByText('Commit', { exact: true })).toBeVisible();
});

test('diagnostics is not reachable without an admin session', async ({ page }) => {
  await page.goto('/admin/diagnostics');
  await expect(page).toHaveURL(/\/admin\/login/, { timeout: 15_000 });
});
