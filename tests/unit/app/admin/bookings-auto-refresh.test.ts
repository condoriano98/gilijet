import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const dir = path.join(process.cwd(), 'src/app/admin/(authed)/bookings');

describe('admin bookings auto-refresh', () => {
  const src = readFileSync(path.join(dir, 'auto-refresh.tsx'), 'utf8');

  it('is a client component that refreshes the router on an interval', () => {
    expect(src).toMatch(/^'use client'/);
    expect(src).toMatch(/router\.refresh\(\)/);
    expect(src).toMatch(/setInterval\(/);
    expect(src).toMatch(/clearInterval\(/);
  });

  it('skips hidden tabs', () => {
    expect(src).toMatch(/visibilityState === 'visible'/);
  });

  it('is mounted on the bookings page', () => {
    const page = readFileSync(path.join(dir, 'page.tsx'), 'utf8');
    expect(page).toMatch(/<AutoRefresh \/>/);
  });
});
