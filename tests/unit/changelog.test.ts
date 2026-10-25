import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import pkg from '../../package.json';

/**
 * Every version bump adds a dated section in the same commit
 * (docs/RELEASING.md). Failing here keeps a version from shipping without its
 * changelog entry.
 */
const changelog = readFileSync(join(__dirname, '../../CHANGELOG.md'), 'utf8');

describe('CHANGELOG.md', () => {
  it('has a section for the current package.json version', () => {
    const escaped = pkg.version.replace(/\./g, '\\.');
    expect(changelog).toMatch(new RegExp(`^## \\[${escaped}\\] - \\d{4}-\\d{2}-\\d{2}$`, 'm'));
  });

  it('keeps an [Unreleased] section above the releases', () => {
    const unreleased = changelog.indexOf('## [Unreleased]');
    const current = changelog.indexOf(`## [${pkg.version}]`);
    expect(unreleased).toBeGreaterThan(-1);
    expect(unreleased).toBeLessThan(current);
  });

  it('links the current version', () => {
    expect(changelog).toMatch(new RegExp(`^\\[${pkg.version.replace(/\./g, '\\.')}\\]: https://github\\.com/condoriano98/gilijet/`, 'm'));
  });
});
