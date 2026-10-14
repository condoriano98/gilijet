import { describe, it, expect } from 'vitest';
import { shouldMigrate } from '../../../scripts/db-migrate-if-configured.mjs';

/**
 * The build runs `prisma migrate deploy` only where it owns a database. A
 * preview of any other branch must never migrate: the database variables in
 * this project are scoped to Preview as well as Production.
 */
const run = (env: Record<string, string>) => shouldMigrate(env).run as boolean;

describe('shouldMigrate', () => {
  it('migrates on Vercel production', () => {
    expect(run({ VERCEL: '1', VERCEL_ENV: 'production', VERCEL_TARGET_ENV: 'production' })).toBe(true);
  });

  it('migrates on the custom staging environment (VERCEL_ENV says preview)', () => {
    expect(run({ VERCEL: '1', VERCEL_ENV: 'preview', VERCEL_TARGET_ENV: 'staging' })).toBe(true);
  });

  it('skips a preview of any other branch', () => {
    expect(run({ VERCEL: '1', VERCEL_ENV: 'preview', VERCEL_TARGET_ENV: 'preview' })).toBe(false);
    expect(run({ VERCEL: '1', VERCEL_ENV: 'preview' })).toBe(false);
  });

  it('skips an unknown or other custom environment', () => {
    expect(run({ VERCEL: '1', VERCEL_TARGET_ENV: 'qa' })).toBe(false);
    expect(run({ VERCEL: '1' })).toBe(false);
  });

  it('falls back to VERCEL_ENV when VERCEL_TARGET_ENV is absent', () => {
    expect(run({ VERCEL: '1', VERCEL_ENV: 'production' })).toBe(true);
  });

  it('runs on a local or CI build outside Vercel', () => {
    expect(run({})).toBe(true);
    expect(run({ CI: 'true' })).toBe(true);
  });

  it('explains why it skipped', () => {
    expect(shouldMigrate({ VERCEL: '1', VERCEL_TARGET_ENV: 'preview' }).reason).toContain('preview');
  });
});
