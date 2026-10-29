import { DEFAULT_APP_BASE_URL } from '@/shared/constants/site';

/**
 * The public origin of this deployment, without a trailing slash. Read straight
 * from the environment (not through `env`) so metadata, robots and sitemap
 * never depend on the validated env object loading.
 */
export function siteUrl(): string {
  return (process.env.APP_BASE_URL || DEFAULT_APP_BASE_URL).replace(/\/$/, '');
}
