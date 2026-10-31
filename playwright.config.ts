import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never' }]]
    : [['list']],
  use: {
    baseURL,
    // CI runs with the marketing tags on (see .github/workflows/ci.yml). An
    // "essential only" choice keeps the consent banner from covering other
    // specs' buttons; marketing-consent.spec.ts starts from a clean context.
    storageState: {
      cookies: [
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
      ],
      origins: [],
    },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: /mobile-layout\.spec\.ts/,
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 5'] },
      testMatch: /mobile-layout\.spec\.ts/,
    },
    // The booking, pay and lookup specs again on a 375 px phone. They share
    // fixtures with the desktop run, so this project starts only once chromium
    // has finished (and is skipped if chromium fails).
    {
      name: 'mobile-flow',
      use: { ...devices['Pixel 5'], viewport: { width: 375, height: 667 } },
      dependencies: ['chromium'],
      testMatch: [
        /customer-booking\.spec\.ts/,
        /round-trip-booking\.spec\.ts/,
        /booking-.*\.spec\.ts/,
        /home-search\.spec\.ts/,
        /mobile-sweep\.spec\.ts/,
      ],
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'pnpm dev',
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
