import { expect, type Locator, type Page } from '@playwright/test';

/** Phone, tablet and desktop widths every redesigned page is checked at. */
export const VIEWPORTS = [
  { name: '375', width: 375, height: 812 },
  { name: '768', width: 768, height: 1024 },
  { name: '1280', width: 1280, height: 800 },
] as const;

/**
 * A page wider than its viewport shrinks the whole document on a phone. Names
 * the widest element so a failure says what to fix (same idea as
 * mobile-layout.spec.ts, which runs at one device width only).
 */
export async function expectNoHorizontalOverflow(page: Page) {
  const { scroll, client, widest } = await page.evaluate(() => {
    const root = document.documentElement;
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
  expect(scroll, `page is ${scroll}px wide in a ${client}px viewport (widest: ${widest})`).toBeLessThanOrEqual(
    client + 1,
  );
}

/** Smallest tap target the design asks for on a phone, in CSS px. */
export const MIN_TOUCH_PX = 44;

async function labelOf(button: Locator, i: number) {
  return ((await button.innerText().catch(() => '')) || (await button.getAttribute('value')) || `#${i}`).trim();
}

/**
 * Every visible submit button is the element that receives a tap at its centre:
 * a sticky bar, banner or overlapping card on top of it fails here. Scrolls each
 * button to the middle of the screen first: a visitor can scroll that far, and the
 * consent banner (fixed, bottom) would otherwise cover a button sitting at the lower
 * edge, which says nothing about the page. All failures are reported.
 */
export async function expectSubmitButtonsReachable(page: Page) {
  // A disabled button is skipped: it has `pointer-events: none`, so the point test would name the form behind it.
  const buttons = page.locator('button[type="submit"]:visible:enabled, input[type="submit"]:visible:enabled');
  const count = await buttons.count();
  for (let i = 0; i < count; i++) {
    const button = buttons.nth(i);
    await button.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    const covering = await button.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (!hit || hit === el || el.contains(hit)) return null;
      return `${hit.tagName.toLowerCase()}.${(hit.className || '').toString().slice(0, 60)}`;
    });
    expect.soft(covering, `"${await labelOf(button, i)}" is covered by ${covering}`).toBeNull();
  }
}

/** Every visible submit button is at least `MIN_TOUCH_PX` high. All failures are reported. */
export async function expectSubmitButtonsBigEnough(page: Page) {
  const buttons = page.locator('button[type="submit"]:visible, input[type="submit"]:visible');
  const count = await buttons.count();
  for (let i = 0; i < count; i++) {
    const button = buttons.nth(i);
    const box = await button.boundingBox();
    const label = await labelOf(button, i);
    expect.soft(box?.height ?? 0, `submit button "${label}" is ${box?.height}px high`).toBeGreaterThanOrEqual(MIN_TOUCH_PX);
  }
}
