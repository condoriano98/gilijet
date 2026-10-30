import { expect, type Page } from '@playwright/test';

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
