import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * The Tailwind Typography plugin (`@tailwindcss/typography`) is not installed, so
 * `prose`, `prose-slate`, `prose-h2:...` and the like do nothing: headings lose
 * their size and lists lose their bullets. The change-plans page, the privacy and
 * refunds pages shipped like that in the redesign and were only caught by looking
 * at them. Spacing, bullets and headings must be written as plain classes
 * (`.prose-content` in globals.css and `not-prose` are fine).
 */
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? files(full) : /\.(tsx|ts)$/.test(name) ? [full] : [];
  });
}

describe('no Tailwind Typography classes without the plugin', () => {
  it('uses no prose utility in src', () => {
    const offenders: string[] = [];
    for (const file of files(path.join(process.cwd(), 'src'))) {
      // Comments may name the plugin; only code and class strings count.
      const source = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
      for (const m of source.matchAll(/(?<![\w-])(?:sm:|md:|lg:)?prose(?:-(?!content\b)[a-z0-9]+(?::[^\s"'`]*)?)?(?=[\s"'`])/g)) {
        if (m[0].includes('not-prose')) continue;
        offenders.push(`${path.relative(process.cwd(), file)}: ${m[0]}`);
      }
    }
    expect(offenders, 'Typography plugin classes found').toEqual([]);
  });
});
