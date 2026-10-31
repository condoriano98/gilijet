import { expect, type Locator, type Page } from '@playwright/test';

/** Sizes a first-time visitor is checked at: a small laptop and a phone. */
export const FIRST_VISIT_SIZES = [
  { name: 'laptop 1280x720', width: 1280, height: 720 },
  { name: 'phone 375x812', width: 375, height: 812 },
] as const;

/**
 * What a tap at the centre of `locator` would hit.
 *  - `self`: the element itself (or one of its children) is on top;
 *  - `offscreen`: the centre is outside the window, so the visitor has to scroll first;
 *  - `covered by <testid or tag>`: something else is on top (a banner, a sticky bar).
 * `scroll: 'center'` first scrolls the element to the middle of the window, as a
 * visitor does before tapping; `'none'` looks at the page as it opens.
 */
export async function tapStatus(locator: Locator, scroll: 'none' | 'center'): Promise<string> {
  return locator.evaluate((el, mode) => {
    if (mode === 'center') el.scrollIntoView({ block: 'center', inline: 'nearest' });
    const r = el.getBoundingClientRect();
    const x = Math.min(Math.max(r.left + r.width / 2, 0), innerWidth - 1);
    const y = r.top + r.height / 2;
    if (y < 0 || y >= innerHeight) return 'offscreen';
    const top = document.elementFromPoint(x, y);
    if (top && (top === el || el.contains(top))) return 'self';
    return 'covered by ' + (top?.closest('[data-testid]')?.getAttribute('data-testid') ?? top?.tagName.toLowerCase() ?? 'nothing');
  }, scroll);
}

/**
 * With the consent banner open (every spec starts as a first-time visitor):
 * the controls that are in view when the page opens are not covered, and every
 * control receives a tap once it is scrolled to the middle of the window.
 * All problems are reported together.
 */
export async function expectControlsTappable(page: Page, controls: Record<string, Locator>) {
  await expect(page.getByTestId('consent-banner')).toBeVisible({ timeout: 15_000 });
  for (const [name, locator] of Object.entries(controls)) {
    await expect(locator, `${name} is on the page`).toBeVisible({ timeout: 15_000 });
    await page.evaluate(() => window.scrollTo(0, 0));
    const opening = await tapStatus(locator, 'none');
    expect.soft(['self', 'offscreen'], `${name} as the page opens: ${opening}`).toContain(opening);
    const centred = await tapStatus(locator, 'center');
    expect.soft(centred, `${name} after scrolling it to the middle`).toBe('self');
  }
}
