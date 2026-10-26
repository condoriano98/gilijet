import { test, expect, type Page } from '@playwright/test';

/**
 * Consent banner, Consent Mode defaults and the dataLayer contract.
 *
 * Needs MARKETING_EVENTS_ENABLED=true and a NEXT_PUBLIC_GTM_ID on the server
 * (CI's e2e job sets both). Google and Meta scripts are blocked: this checks
 * what the app pushes, not what Google does with it. No database fixtures.
 */
test.use({ storageState: { cookies: [], origins: [] } });

async function blockThirdParty(page: Page) {
  await page.route(/googletagmanager\.com|google-analytics\.com|facebook\.net|facebook\.com\/tr/, (r) => r.abort());
}

type Entry = Record<string, unknown> & { event?: string; 0?: string; 1?: string; 2?: Record<string, string> };
const dataLayer = (page: Page) =>
  page.evaluate(() => ((window as unknown as { dataLayer?: Entry[] }).dataLayer ?? []) as Entry[]);

test.describe('marketing consent and dataLayer', () => {
  test('defaults to denied, stores nothing before a choice, and keeps PII out of page views', async ({ page, context }) => {
    await blockThirdParty(page);
    await page.goto('/privacy?utm_source=google&utm_medium=cpc&gclid=E2EGCLID&email=leak@example.com');
    await expect(page.getByTestId('consent-banner')).toBeVisible();

    const names = (await context.cookies()).map((c) => c.name);
    expect(names).not.toContain('gf_attr');
    expect(names).not.toContain('gf_vid');

    const layer = await dataLayer(page);
    const consentDefault = layer.findIndex((e) => e[0] === 'consent' && e[1] === 'default');
    const gtmStart = layer.findIndex((e) => e.event === 'gtm.js');
    expect(consentDefault).toBeGreaterThan(-1);
    expect(gtmStart).toBeGreaterThan(consentDefault);
    expect(layer[consentDefault][2]).toMatchObject({ ad_storage: 'denied', analytics_storage: 'denied', ad_user_data: 'denied' });

    const views = layer.filter((e) => e.event === 'page_view');
    expect(views).toHaveLength(1);
    expect(String(views[0].page_location)).not.toContain('leak@example.com');
    expect(String(views[0].page_location)).toContain('gclid=E2EGCLID');
  });

  test('accepting keeps the landing that arrived before the choice and updates consent', async ({ page, context }) => {
    await blockThirdParty(page);
    await page.goto('/privacy?utm_source=facebook&utm_medium=paid_social&utm_id=120200&fbclid=E2EFB');
    await page.getByRole('button', { name: 'Accept all' }).click();
    await expect(page.getByTestId('consent-banner')).toBeHidden();

    const cookies = Object.fromEntries((await context.cookies()).map((c) => [c.name, c.value]));
    expect(cookies.gf_consent).toMatch(/^v1\.a1\.m1\./);
    expect(cookies.gf_vid).toMatch(/^v_[a-f0-9]+$/);
    const attr = JSON.parse(decodeURIComponent(cookies.gf_attr));
    expect(attr.lt).toMatchObject({ src: 'facebook', med: 'paid_social', cid: '120200', fbclid: 'E2EFB' });

    const update = (await dataLayer(page)).find((e) => e[0] === 'consent' && e[1] === 'update');
    expect(update?.[2]).toMatchObject({ ad_storage: 'granted', analytics_storage: 'granted' });
  });

  test('client-side navigation adds exactly one page_view and masks booking references', async ({ page }) => {
    await blockThirdParty(page);
    await page.goto('/privacy');
    await page.getByRole('button', { name: 'Essential only' }).click();
    await page.getByRole('link', { name: 'Refund Policy' }).first().click();
    await page.waitForURL('**/refunds');
    await expect.poll(async () => (await dataLayer(page)).filter((e) => e.event === 'page_view').length).toBe(2);
    const views = (await dataLayer(page)).filter((e) => e.event === 'page_view');
    expect(views[1].page_path).toBe('/refunds');
    expect(views[1].page_referrer).toContain('/privacy');

    await page.goto('/b/GF-NOT-A-REAL-REF');
    const masked = (await dataLayer(page)).filter((e) => e.event === 'page_view').pop();
    if (masked) expect(String(masked.page_location)).toContain('/b/:id');
  });

  test('rejecting stores only the choice and drops click ids; the footer link reopens the banner', async ({ page, context }) => {
    await blockThirdParty(page);
    await page.goto('/privacy?gclid=SHOULDNOTSTICK');
    await page.getByRole('button', { name: 'Essential only' }).click();
    const names = (await context.cookies()).map((c) => c.name);
    expect(names).toContain('gf_consent');
    expect(names).not.toContain('gf_attr');
    expect(names).not.toContain('gf_vid');
    await page.getByRole('button', { name: 'Cookie settings' }).click();
    await expect(page.getByTestId('consent-banner')).toBeVisible();
  });

  test('admin pages never load the container', async ({ page }) => {
    await blockThirdParty(page);
    await page.goto('/admin/login');
    expect(await page.evaluate(() => Boolean(document.getElementById('gf-gtm')))).toBe(false);
    await expect(page.getByTestId('consent-banner')).toHaveCount(0);
  });
});
