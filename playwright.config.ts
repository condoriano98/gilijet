import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

// e2e writes fixtures and deletes them, so it may only ever touch the local
// Docker Postgres (`docker run ... -p 54329:5432`, see docs/qa-runs/README.md),
// never the Supabase project that `.env`, `.env.local` and a plain `pnpm dev`
// point at. This block runs in the runner and in every worker, before any spec
// opens a Prisma client or the dev server starts.
const LOCAL_DB = 'postgresql://postgres:dev@localhost:54329/dev';
const isLocalHost = (url: string) => {
  try {
    return ['localhost', '127.0.0.1', '[::1]', '::1'].includes(new URL(url).hostname);
  } catch {
    return false;
  }
};
for (const key of ['DATABASE_URL', 'DIRECT_URL'] as const) {
  const set = process.env[key];
  if (set && !isLocalHost(set)) {
    throw new Error(
      `${key} is not a local database. e2e only runs against the local Docker Postgres; unset ${key} or point it at localhost.`,
    );
  }
  process.env[key] ??= LOCAL_DB;
}
if (!isLocalHost(baseURL) && process.env.E2E_ALLOW_REMOTE !== '1') {
  throw new Error(
    `E2E_BASE_URL (${new URL(baseURL).hostname}) is not local. e2e writes data; set E2E_ALLOW_REMOTE=1 only with the owner's explicit go.`,
  );
}
// Throw-away secrets, so the server and the specs that sign payloads agree and
// the real ones in `.env` are never used.
process.env.AUTH_SECRET ??= 'local-qa-secret-at-least-32-characters';
process.env.QR_HMAC_SECRET ??= 'local-qa-qr-hmac-secret-at-least-32';
process.env.CRON_SECRET ??= 'local-qa-cron-secret';
process.env.APP_BASE_URL ??= baseURL;
process.env.MARKETING_EVENTS_ENABLED ??= 'true';
process.env.NEXT_PUBLIC_GTM_ID ??= 'GTM-E2ETEST';
process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN ??= 'local-verify-token-0123456789';
process.env.WHATSAPP_APP_SECRET ??= 'local-app-secret-0123456789';
process.env.WHATSAPP_TEMPLATE_ORDER_NOTIF ??= 'order_masuk_operator';
// An empty string beats the value in `.env.local`; an unset variable does not.
const OUTBOUND = [
  'DOKU_CLIENT_ID', 'DOKU_SECRET_KEY', 'DOKU_IS_PRODUCTION',
  'PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET', 'PAYPAL_WEBHOOK_ID', 'PAYPAL_IS_PRODUCTION', 'PAYPAL_PRESENTMENT_CURRENCY',
  'WATI_API_KEY', 'WATI_TENANT_ID', 'WATI_API_URL', 'RESEND_API_KEY', 'RESEND_FROM_EMAIL',
  'GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET', 'MCP_REVIEWER_TOKEN',
  'SUPABASE_URL', 'SUPABASE_ANON_KEY',
  'INBOX_IMAP_HOST', 'INBOX_IMAP_PORT', 'INBOX_IMAP_USER', 'INBOX_IMAP_PASSWORD', 'INBOX_POLL_SINCE',
  'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD', 'EMAIL_FROM',
  'WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_BUSINESS_ACCOUNT_ID', 'WHATSAPP_API_VERSION', 'WHATSAPP_TEMPLATE_LANG',
] as const;
const blankedOutbound = Object.fromEntries(OUTBOUND.map((k) => [k, '']));
// The runner and its workers too: Prisma loads `.env` into process.env when a
// spec imports it, and the specs refuse to run (and skip) when a live key is set.
for (const key of OUTBOUND) process.env[key] = '';

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
    // Every spec starts as a first-time visitor: no saved consent choice, so the
    // consent banner is open and can cover what the spec clicks, as it does for a
    // real visitor. A spec that needs a saved choice sets it itself (see
    // `tests/e2e/support/consent.ts`). CI runs with the marketing tags on
    // (.github/workflows/ci.yml).
    storageState: { cookies: [], origins: [] },
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
        // Never adopt a server that is already there: it may be the owner's `pnpm dev`
        // on the Supabase staging database. A busy port makes the run fail instead.
        reuseExistingServer: false,
        timeout: 120_000,
        env: { ...blankedOutbound } as Record<string, string>,
      },
});
