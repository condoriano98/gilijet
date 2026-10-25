import pkg from '../../../package.json';

export interface BuildInfo {
  /** package.json version; bumped by every feature and fix (docs/RELEASING.md). */
  version: string;
  /** Short git SHA of the deployed commit, or null outside a Vercel build. */
  commit: string | null;
  branch: string | null;
}

export function getBuildInfo(): BuildInfo {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA?.trim();
  const branch = process.env.VERCEL_GIT_COMMIT_REF?.trim();
  return {
    version: pkg.version,
    commit: sha ? sha.slice(0, 7) : null,
    branch: branch || null,
  };
}
