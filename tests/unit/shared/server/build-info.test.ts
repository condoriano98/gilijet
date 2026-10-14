import { describe, it, expect, afterEach, vi } from 'vitest';
import pkg from '../../../../package.json';
import { getBuildInfo } from '@/shared/server/build-info';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('getBuildInfo', () => {
  it('reports the package.json version, which must be SemVer', () => {
    const { version } = getBuildInfo();
    expect(version).toBe(pkg.version);
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('shortens the Vercel commit SHA and reports the branch', () => {
    vi.stubEnv('VERCEL_GIT_COMMIT_SHA', '1181bd6f0e2a9c3b4d5e6f708192a3b4c5d6e7f8');
    vi.stubEnv('VERCEL_GIT_COMMIT_REF', 'staging');
    expect(getBuildInfo()).toMatchObject({ commit: '1181bd6', branch: 'staging' });
  });

  it('returns null commit and branch outside a Vercel build', () => {
    vi.stubEnv('VERCEL_GIT_COMMIT_SHA', '');
    vi.stubEnv('VERCEL_GIT_COMMIT_REF', '');
    expect(getBuildInfo()).toMatchObject({ commit: null, branch: null });
  });
});
