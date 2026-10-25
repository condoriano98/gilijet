import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const dir = path.join(process.cwd(), 'src/app/admin/(authed)/webhooks');

describe('admin webhooks surface', () => {
  it.each(['page.tsx', 'actions.ts'])('%s calls requireAdmin()', (file) => {
    const src = readFileSync(path.join(dir, file), 'utf8');
    expect(src).toMatch(/await requireAdmin\(\)/);
  });

  it('only retries events a handler exists for', () => {
    const src = readFileSync(path.join(dir, 'actions.ts'), 'utf8');
    expect(src).toMatch(/isRetryableEvent\(/);
    expect(src).toMatch(/status: 'FAILED'/);
  });
});

describe('public webhook routes', () => {
  it.each(['doku', 'paypal'])('%s route caps the body before reading it', (name) => {
    const src = readFileSync(path.join(process.cwd(), `src/app/api/webhooks/${name}/route.ts`), 'utf8');
    expect(src.indexOf('isOversizedWebhookBody(')).toBeGreaterThan(-1);
    expect(src.indexOf('isOversizedWebhookBody(')).toBeLessThan(src.indexOf('req.text()'));
    expect(src).toMatch(/status: 413/);
  });

  it('paypal route answers 503 when verification throws', () => {
    const src = readFileSync(path.join(process.cwd(), 'src/app/api/webhooks/paypal/route.ts'), 'utf8');
    expect(src).toMatch(/status: 503/);
  });
});
