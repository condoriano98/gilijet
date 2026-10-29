import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * What the browser tab shows. The root layout appends " · Gilifast" to every
 * page title, so a page that spells it out too gets it twice, and the tab has
 * room for about 30 characters. Source is read as text because the layout
 * imports `next/font`, which does not load under vitest.
 */
const APP = join(__dirname, '../../../src/app');
const read = (...p: string[]) => readFileSync(join(APP, ...p), 'utf8');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(name) ? [full] : [];
  });
}

describe('tab title', () => {
  const layout = read('layout.tsx');

  it('uses a short default that fits a tab, and keeps the long form for share cards', () => {
    const tab = /const TAB_TITLE = '([^']+)'/.exec(layout)?.[1];
    expect(tab).toBeTruthy();
    expect(tab!.length).toBeLessThanOrEqual(30);
    expect(layout).toMatch(/default: TAB_TITLE/);
    expect(layout).toMatch(/title: SITE_TITLE/);
  });

  it('keeps the suffix template in one place', () => {
    expect(layout).toContain("template: '%s · Gilifast'");
  });

  it('no page repeats the suffix the root template adds', () => {
    const offenders = sourceFiles(APP)
      .filter((f) => !f.endsWith(join('app', 'layout.tsx')))
      .filter((f) => /title:\s*['"`][^'"`]*·\s*Gilifast['"`]/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('operator and admin have their own title that skips the customer suffix', () => {
    expect(read('operator', 'layout.tsx')).toMatch(/absolute: 'Operator · Gilifast'/);
    expect(read('admin', 'layout.tsx')).toMatch(/absolute: 'Admin · Gilifast'/);
  });
});

describe('tab icon', () => {
  it('generates a 32px icon and a 180px apple icon from the same mark', () => {
    const icon = read('icon.tsx');
    const apple = read('apple-icon.tsx');
    expect(icon).toMatch(/width: 32, height: 32/);
    expect(apple).toMatch(/width: 180, height: 180/);
    for (const src of [icon, apple]) {
      expect(src).toContain("contentType = 'image/png'");
      expect(src).toContain('BrandIcon');
    }
  });

  it('the locale proxy leaves the icon routes alone', () => {
    const proxy = readFileSync(join(__dirname, '../../../src/proxy.ts'), 'utf8');
    const matcher = /matcher:\s*\['([^']+)'\]/.exec(proxy)?.[1] ?? '';
    expect(matcher).toMatch(/\bicon\b/);
    expect(matcher).toMatch(/apple-icon/);
  });
});
