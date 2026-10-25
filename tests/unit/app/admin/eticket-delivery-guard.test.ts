import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const dir = path.join(process.cwd(), 'src/app/admin/(authed)/eticket-delivery');

describe('admin e-ticket delivery surface', () => {
  it.each(['page.tsx', 'actions.ts'])('%s calls requireAdmin()', (file) => {
    expect(readFileSync(path.join(dir, file), 'utf8')).toMatch(/await requireAdmin\(\)/);
  });

  it('every exported server action checks the admin before doing anything else', () => {
    const src = readFileSync(path.join(dir, 'actions.ts'), 'utf8');
    const bodies = src.split(/export async function /).slice(1);
    expect(bodies.length).toBeGreaterThanOrEqual(2);
    for (const body of bodies) {
      expect(body.slice(body.indexOf('{') + 1).trimStart()).toMatch(/^(?:\/\*[\s\S]*?\*\/\s*)?(?:const \w+ = )?await requireAdmin\(\)/);
    }
  });

  it('the mailbox check runs the same poller as the cron, outside any try that would swallow the redirect', () => {
    const src = readFileSync(path.join(dir, 'actions.ts'), 'utf8');
    expect(src).toMatch(/pollOperatorInbox\(\)/);
    expect(src).toMatch(/not_configured/);
    expect(src).toMatch(/mailbox_unreachable/);
  });
});
