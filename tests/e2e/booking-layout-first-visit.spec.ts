import { test, expect, type Page } from '@playwright/test';
import { loadEnvConfig } from '@next/env';
import { PrismaClient } from '@prisma/client';
import { requireMockPayments } from './support/mock-payments';
import { removeBookings, removeSchedules } from './support/fixtures';
import { createTrip } from './support/customers';
import { VIEWPORTS, expectNoHorizontalOverflow, expectSubmitButtonsReachable, MIN_TOUCH_PX } from './support/overflow';
import { FIRST_VISIT_SIZES, expectControlsTappable } from './support/first-visit';

loadEnvConfig(process.cwd());
requireMockPayments();

/**
 * How the booking pages (book, checkout, booking page, find booking) fit three
 * widths (BOOK-G17), whether a first-time visitor, with the consent banner open,
 * can tap their controls (BOOK-G19 to G22, same idea as CONT-035), and the 44 px
 * tap floor the redesign sets (BOOK-G23, known bug B13). Reads only: no booking is
 * made. `/pay/<ref>` sends a mock-mode booking on to the checkout, so the checkout
 * is the pay page here. These routes are NOT in `REDESIGNED_ROUTES` yet: MOB-004
 * starts guarding them in the stage that restyles them.
 *
 * Own route in 2088 and two bookings, removed afterwards. Relies on
 * `pnpm seed:qa` (QA boat).
 */
const prisma = new PrismaClient();

const ORIGIN = 'E2E LV Origin';
const DESTINATION = 'E2E LV Dest';
const EMAIL = 'e2e-layout-first-visit@example.invalid';
const REF_PENDING = 'E2E-LV-PEND';
const REF_CONFIRMED = 'E2E-LV-CONF';

let legId = '';

test.describe.configure({ mode: 'serial' });

async function cleanup() {
  const ids = (await prisma.booking.findMany({ where: { customerEmail: EMAIL }, select: { id: true } })).map((b) => b.id);
  await prisma.ticket.deleteMany({ where: { bookingId: { in: ids } } });
  await removeBookings(prisma, { customerEmail: EMAIL });
  await removeSchedules(prisma, [ORIGIN]);
}

test.beforeAll(async () => {
  await cleanup();
  const trip = await createTrip(prisma, { origin: ORIGIN, destination: DESTINATION, dates: ['2088-10-12'] });
  legId = trip.legs[0].id;
  const mk = (bookingReference: string, status: 'PENDING_PAYMENT' | 'CONFIRMED') =>
    prisma.booking.create({
      data: {
        bookingReference,
        legId,
        operatorId: trip.boat.operatorId,
        customerName: 'E2E Layout Customer',
        customerEmail: EMAIL,
        customerPhone: '+620000000000',
        totalAmount: 100_000,
        commissionAmount: 8_000,
        operatorAmount: 92_000,
        status,
        refundDeadline: new Date('2088-10-01T00:00:00Z'),
        notes: JSON.stringify({ passengers: [{ name: 'E2E Passenger', idNumber: null, type: 'ADULT' }] }),
        ...(status === 'PENDING_PAYMENT' ? { payment: { create: { amount: 100_000, method: 'BANK_TRANSFER' as const, status: 'PENDING' as const } } } : {}),
      },
    });
  await mk(REF_PENDING, 'PENDING_PAYMENT');
  const confirmed = await mk(REF_CONFIRMED, 'CONFIRMED');
  await prisma.ticket.create({
    data: { bookingId: confirmed.id, ticketCode: 'TK-2088-10-E2ELV-1', passengerName: 'E2E Passenger', qrHash: 'e2e-lv-qr-1' },
  });
});

test.afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

const payButton = (page: Page) => page.getByRole('button', { name: /^Pay\s/ });

const PAGES = {
  book: { label: 'booking form', url: () => `/book/${legId}?passengers=2`, ready: (p: Page) => expect(p.locator('#passengerName-1')).toBeVisible({ timeout: 15_000 }) },
  checkout: { label: 'checkout', url: () => `/checkout/${REF_PENDING}`, ready: (p: Page) => expect(p.getByText('TEST MODE')).toBeVisible({ timeout: 15_000 }) },
  detail: { label: 'booking page', url: () => `/b/${REF_CONFIRMED}`, ready: (p: Page) => expect(p.locator('body')).toContainText(REF_CONFIRMED, { timeout: 15_000 }) },
} as const;

// ── Layout at three widths (BOOK-G17) ───────────────────────────────────────

for (const [key, pageDef] of Object.entries(PAGES) as [keyof typeof PAGES, (typeof PAGES)[keyof typeof PAGES]][]) {
  for (const vp of VIEWPORTS) {
    test(`BOOK-G17 ${pageDef.label} at ${vp.name} px: no sideways scroll, primary buttons can be tapped`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(pageDef.url());
      await pageDef.ready(page);
      // The booking page grows as its cards and QR images arrive; measure once it has settled.
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(300);
      await expectNoHorizontalOverflow(page);
      await expectSubmitButtonsReachable(page);
      if (key === 'checkout') {
        // The checkout's buttons are not submit buttons.
        await expect(page.getByRole('button', { name: 'Cancel payment' })).toBeVisible();
        await expect(page.getByRole('button', { name: /Accept the terms to pay|^Pay\s/ })).toBeVisible();
      }
    });
  }
}

// Bug B12 (docs/spikes/in-progress/BUGS_QA_BASELINE_FINDINGS.md), measured again 2026-10-31: the
// booking page is 390 px wide in a 375 px window for its first render and fits about 200 ms later,
// so a phone paints it wider first. The settled page above passes. Remove test.fail when the first
// render fits too. The `mobile-flow` project has its own pin (BOOK-M02).
test('BOOK-G17b booking page at 375 px: it fits already on its first render', async ({ page }) => {
  test.skip(test.info().project.name !== 'chromium', 'pinned in the mobile-flow project by BOOK-M02');
  test.fail(true, 'B12: the booking page is 390 px wide in a 375 px window until it settles');
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`/b/${REF_CONFIRMED}`);
  await expect(page.locator('body')).toContainText(REF_CONFIRMED, { timeout: 15_000 });
  await expectNoHorizontalOverflow(page);
});

// ── A first-time visitor with the consent banner open (BOOK-G19 to G22) ────

for (const size of FIRST_VISIT_SIZES) {
  test(`BOOK-G19 booking form, first visit at ${size.name}: fields and the Pay button can be tapped`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.goto(`/book/${legId}?passengers=1`);
    await expectControlsTappable(page, {
      'passenger name': page.locator('#passengerName-0'),
      'your name': page.locator('#customerName'),
      email: page.locator('#customerEmail'),
      'terms checkbox': page.locator('input[name="agreedToTerms"]'),
      'Pay button': payButton(page),
    });
  });

  test(`BOOK-G20 checkout (and /pay, which lands on it), first visit at ${size.name}: tabs, terms and the buttons can be tapped`, async ({ page }) => {
    // Bug B19 (the consent banner over the terms checkbox on a phone) was fixed with the compact banner (B14).
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.goto(`/pay/${REF_PENDING}`);
    await page.waitForURL(new RegExp(`/checkout/${REF_PENDING}`), { timeout: 15_000 });
    await expectControlsTappable(page, {
      'Card tab': page.getByRole('button', { name: 'Card', exact: true }),
      'QRIS tab': page.getByRole('button', { name: 'QRIS', exact: true }),
      'Bank tab': page.getByRole('button', { name: 'Bank Transfer', exact: true }),
      'terms checkbox': page.locator('input[type="checkbox"]').first(),
      'Pay button': page.getByRole('button', { name: /Accept the terms to pay|^Pay\s/ }),
      'Cancel payment': page.getByRole('button', { name: 'Cancel payment' }),
    });
  });

  test(`BOOK-G21 booking page, first visit at ${size.name}: Complete payment and Cancel booking can be tapped`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.goto(`/b/${REF_PENDING}`);
    await expectControlsTappable(page, {
      'Complete payment': page.getByRole('link', { name: 'Complete payment' }),
      'confirm email': page.getByLabel('Confirm your email to cancel'),
      'Cancel booking': page.getByRole('button', { name: 'Cancel booking' }),
    });
  });

  test(`BOOK-G22 find booking, first visit at ${size.name}: the reference field and Look up can be tapped`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.goto('/b');
    await expectControlsTappable(page, {
      'reference field': page.getByLabel('Booking reference'),
      'Look up': page.getByRole('button', { name: /Look up/ }),
    });
  });
}

// ── The 44 px floor (BOOK-G23). Known bug B13: remove each test.fail when its page is restyled. ──

/** Every visible button and button-like link in the page body that is under the floor. */
async function undersized(page: Page, scope: string) {
  return page.locator(scope).evaluate((root, floor) => {
    const out: string[] = [];
    for (const el of Array.from(root.querySelectorAll('button, a[role="button"], input[type="submit"]'))) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || (el as HTMLButtonElement).closest('[data-testid="consent-banner"]')) continue;
      if (r.height < floor) out.push(`"${(el.textContent || (el as HTMLInputElement).value || el.getAttribute('aria-label') || '?').trim().slice(0, 30)}" ${Math.round(r.height)}px`);
    }
    return out;
  }, MIN_TOUCH_PX);
}

test('BOOK-G23 find booking: every button is at least 44 px high', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/b');
  await expect(page.getByRole('button', { name: /Look up/ })).toBeVisible({ timeout: 15_000 });
  expect(await undersized(page, 'main')).toEqual([]);
});

test('BOOK-G23b booking page (unpaid): every button is at least 44 px high', async ({ page }) => {
  test.fail(true, 'B13: "Cancel booking" is 36 px high');
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`/b/${REF_PENDING}`);
  await expect(page.getByRole('button', { name: 'Cancel booking' })).toBeVisible({ timeout: 15_000 });
  expect(await undersized(page, 'main')).toEqual([]);
});

test('BOOK-G23c booking form: every button is at least 44 px high', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`/book/${legId}?passengers=1`);
  await expect(payButton(page)).toBeVisible({ timeout: 15_000 });
  const small = await undersized(page, 'main');
  test.fail(small.length > 0, `B13: ${small.join(', ')}`);
  expect(small).toEqual([]);
});

test('BOOK-G23d checkout: every button is at least 44 px high', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`/checkout/${REF_PENDING}`);
  await expect(page.getByText('TEST MODE')).toBeVisible({ timeout: 15_000 });
  const small = await undersized(page, 'main');
  test.fail(small.length > 0, `B13: ${small.join(', ')}`);
  expect(small).toEqual([]);
});
