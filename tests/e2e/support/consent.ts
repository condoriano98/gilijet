import type { BrowserContext } from '@playwright/test';

/** An "essential only" consent choice: the banner stays hidden. */
export async function saveEssentialOnlyChoice(context: BrowserContext, baseURL: string) {
  await context.addCookies([
    {
      name: 'gf_consent',
      value: 'v1.a0.m0.1761436800000',
      domain: new URL(baseURL).hostname,
      path: '/',
      expires: -1,
      httpOnly: false,
      secure: false,
      sameSite: 'Lax',
    },
  ]);
}
