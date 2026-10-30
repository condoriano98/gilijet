import { describe, it, expect } from 'vitest';
import { safeNext } from '@/shared/lib/safe-next';

describe('safeNext', () => {
  it('keeps a path on this site, with its query and hash', () => {
    expect(safeNext('/account')).toBe('/account');
    expect(safeNext('/b/GF-123?error=missing#top')).toBe('/b/GF-123?error=missing#top');
    expect(safeNext('/')).toBe('/');
  });

  it('falls back when nothing is given', () => {
    expect(safeNext(undefined)).toBe('/');
    expect(safeNext(null)).toBe('/');
    expect(safeNext('')).toBe('/');
    expect(safeNext('', '/account')).toBe('/account');
  });

  it('refuses another site, in every form a browser follows', () => {
    const hostile = [
      'https://evil.example',
      'http://evil.example/x',
      '//evil.example',
      '///evil.example',
      '/\\evil.example',
      '\\\\evil.example',
      'javascript:alert(1)',
      'evil.example/path',
      '/\t/evil.example',
      '/\n/evil.example',
      '/\r/evil.example',
      '/ok\\..\\evil',
      '\u0000/account',
    ];
    for (const raw of hostile) {
      expect(safeNext(raw), JSON.stringify(raw)).toBe('/');
      expect(safeNext(raw, '/account'), JSON.stringify(raw)).toBe('/account');
    }
  });
});
