import { test, expect } from '@playwright/test';
import { loadEnvConfig } from '@next/env';
import { PrismaClient, type BookingStatus } from '@prisma/client';
import { requireMockPayments, payInMockMode } from './support/mock-payments';
import { removeBookings, removeSchedules } from './support/fixtures';
import { createConfirmedBooking, createTrip } from './support/customers';

loadEnvConfig(process.cwd());
requireMockPayments();

/**
 * The mock checkout (failed-payment state, retry, the Card / QRIS / Bank tabs),
 * the booking page of a round-trip booking, the refund preview and the refund
 * a cancellation queues at each tier, and a pending reschedule request. Bookings
 * are written straight to the database, one per case. Nothing is paid except on
 * the mock checkout. `requireMockPayments()` skips the file when a live key is set.
 *
 * Dates for the refund tiers are relative to now (10, 4 and 1 day ahead at
 * 01:00 UTC), so they never age out: whatever the time of day, 10 days is more
 * than 7, 4 days is between 48 hours and 7 days, 1 day is under 48 hours.
 * Everything else sits in 2087 or 2088. Relies on `pnpm seed:qa` (QA boat).
 */
const prisma = new PrismaClient();

const EMAIL = 'e2e-checkout-detail@example.invalid';
const PREFIX = 'E2E-CD-';
const CO = { origin: 'E2E CD Checkout', destination: 'E2E CD Checkout Dest' };
const RT_A = 'E2E CD RtA';
const RT_B = 'E2E CD RtB';
const RF = { origin: 'E2E CD Refund', destination: 'E2E CD Refund Dest' };
const RS = { origin: 'E2E CD Resched', destination: 'E2E CD Resched Dest' };
const ORIGINS = [CO.origin, RT_A, RT_B, RF.origin, RS.origin];

const dayAhead = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

let operatorId = '';
let coLegId = '';
let rtOutLegId = '';
let rtRetLegId = '';
let refundLegs: Record<'full' | 'partial' | 'none', string> = { full: '', partial: '', none: '' };
let reschedLegs: { original: string; pending: string; other: string } = { original: '', pending: '', other: '' };

test.describe.configure({ mode: 'serial' });

async function cleanup() {
  const ids = (await prisma.booking.findMany({ where: { bookingReference: { startsWith: PREFIX } }, select: { id: true } })).map((b) => b.id);
  await prisma.rescheduleRequest.deleteMany({ where: { bookingId: { in: ids } } });
  await prisma.ticket.deleteMany({ where: { bookingId: { in: ids } } });
  await removeBookings(prisma, { bookingReference: { startsWith: PREFIX } });
  await removeSchedules(prisma, ORIGINS);
}

async function mkBooking(opts: {
  reference: string;
  status: BookingStatus;
  legId?: string;
  outboundLegId?: string;
  returnLegId?: string;
  amount?: number;
}) {
  const amount = opts.amount ?? 100_000;
  return prisma.booking.create({
    data: {
      bookingReference: opts.reference,
      tripType: opts.outboundLegId ? 'ROUND_TRIP' : 'ONE_WAY',
      legId: opts.legId ?? null,
      outboundLegId: opts.outboundLegId ?? null,
      returnLegId: opts.returnLegId ?? null,
      operatorId,
      customerName: 'E2E Checkout Customer',
      customerEmail: EMAIL,
      customerPhone: '+620000000000',
      totalAmount: amount,
      commissionAmount: amount * 0.08,
      operatorAmount: amount * 0.92,
      status: opts.status,
      refundDeadline: new Date('2087-06-01T00:00:00Z'),
      // The ticket issuer reads the passenger list from here.
      notes: JSON.stringify({ passengers: [{ name: 'E2E Passenger', idNumber: null, type: 'ADULT' }] }),
      // The booking action creates this row when it starts the payment; the checkout updates it.
      ...(opts.status === 'PENDING_PAYMENT' ? { payment: { create: { amount, method: 'BANK_TRANSFER' as const, status: 'PENDING' as const } } } : {}),
    },
  });
}

test.beforeAll(async () => {
  await cleanup();
  const co = await createTrip(prisma, { origin: CO.origin, destination: CO.destination, dates: ['2088-09-12'] });
  operatorId = co.boat.operatorId;
  coLegId = co.legs[0].id;

  const rtOut = await createTrip(prisma, { origin: RT_A, destination: RT_B, dates: ['2087-09-10'] });
  const rtRet = await createTrip(prisma, { origin: RT_B, destination: RT_A, dates: ['2087-09-14'] });
  rtOutLegId = rtOut.legs[0].id;
  rtRetLegId = rtRet.legs[0].id;

  const rf = await createTrip(prisma, { origin: RF.origin, destination: RF.destination, dates: [dayAhead(10), dayAhead(4), dayAhead(1)] });
  refundLegs = { full: rf.legs[0].id, partial: rf.legs[1].id, none: rf.legs[2].id };

  const rs = await createTrip(prisma, { origin: RS.origin, destination: RS.destination, dates: ['2087-10-10', '2087-10-11', '2087-10-12'] });
  reschedLegs = { original: rs.legs[0].id, pending: rs.legs[1].id, other: rs.legs[2].id };
});

test.afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

const row = (reference: string) => prisma.booking.findUniqueOrThrow({ where: { bookingReference: reference }, include: { payment: true, refund: true } });
const FAILED_NOTICE = 'Payment was cancelled. Please try again.';

// ── Checkout: failed payment (BOOK-G07) and the method tabs (BOOK-G18) ──────

test('BOOK-G07 checkout after a cancelled payment: the notice shows, the form is still there, nothing is paid', async ({ page }) => {
  const ref = `${PREFIX}FAIL1`;
  await mkBooking({ reference: ref, status: 'PENDING_PAYMENT', legId: coLegId });
  await page.goto(`/checkout/${ref}?failed=1`);
  await expect(page.getByText(FAILED_NOTICE)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('TEST MODE')).toBeVisible();
  // The way to try again is on the page.
  await expect(page.getByRole('button', { name: 'Accept the terms to pay' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Cancel payment' })).toBeEnabled();
  const booking = await row(ref);
  expect(booking.status).toBe('PENDING_PAYMENT');
  expect(booking.payment?.status).toBe('PENDING');
});

test('BOOK-G07b pressing Cancel payment returns to the checkout with the notice and leaves the booking unpaid', async ({ page }) => {
  const ref = `${PREFIX}FAIL2`;
  await mkBooking({ reference: ref, status: 'PENDING_PAYMENT', legId: coLegId });
  await page.goto(`/checkout/${ref}`);
  await expect(page.getByText(FAILED_NOTICE)).toHaveCount(0);
  await page.getByRole('button', { name: 'Cancel payment' }).click();
  await page.waitForURL(/failed=1/, { timeout: 15_000 });
  await expect(page.getByText(FAILED_NOTICE)).toBeVisible();
  const booking = await row(ref);
  expect(booking.status).toBe('PENDING_PAYMENT');
  expect(booking.payment?.status).toBe('PENDING');
});

test('BOOK-G07c a payment that failed can be tried again, and then goes through', async ({ page }) => {
  const ref = `${PREFIX}FAIL3`;
  await mkBooking({ reference: ref, status: 'PENDING_PAYMENT', legId: coLegId });
  await page.goto(`/checkout/${ref}?failed=1`);
  await expect(page.getByText(FAILED_NOTICE)).toBeVisible({ timeout: 15_000 });
  await payInMockMode(page);
  await page.waitForURL(new RegExp(`/b/${ref}`), { timeout: 30_000 });
  await expect(page.locator('body')).toContainText(/confirming your seat/i, { timeout: 15_000 });
  const booking = await row(ref);
  expect(booking.status).toBe('AWAITING_CONFIRMATION');
  expect(booking.payment?.status).toBe('SUCCESSFUL');
});

for (const t of [
  { tab: 'Card', ref: 'TABCARD', method: 'CREDIT_CARD', shows: 'Card number' },
  { tab: 'QRIS', ref: 'TABQRIS', method: 'QRIS', shows: 'Scan with any e-wallet or banking app' },
  { tab: 'Bank Transfer', ref: 'TABBANK', method: 'BANK_TRANSFER', shows: 'Virtual Account' },
] as const) {
  test(`BOOK-G18 checkout ${t.tab} tab: it shows its own panel and the payment is recorded as ${t.method}`, async ({ page }) => {
    const ref = `${PREFIX}${t.ref}`;
    await mkBooking({ reference: ref, status: 'PENDING_PAYMENT', legId: coLegId });
    await page.goto(`/checkout/${ref}`);
    await expect(page.getByText('TEST MODE')).toBeVisible({ timeout: 15_000 });
    for (const name of ['Card', 'QRIS', 'Bank Transfer']) {
      await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
    }
    await page.getByRole('button', { name: t.tab, exact: true }).click();
    await expect(page.getByText(t.shows).first()).toBeVisible();
    await payInMockMode(page);
    await page.waitForURL(new RegExp(`/b/${ref}`), { timeout: 30_000 });
    const booking = await row(ref);
    expect(booking.payment?.method).toBe(t.method);
  });
}

// ── Booking page of a round-trip booking (BOOK-G09) ─────────────────────────

test('BOOK-G09 a confirmed round-trip booking: the page names the outbound leg, its date and the status', async ({ page }) => {
  const ref = `${PREFIX}RT1`;
  const booking = await mkBooking({ reference: ref, status: 'CONFIRMED', outboundLegId: rtOutLegId, returnLegId: rtRetLegId, amount: 200_000 });
  await prisma.ticket.create({
    data: { bookingId: booking.id, ticketCode: 'TK-2087-09-E2ECDRT-1', passengerName: 'E2E Passenger', qrHash: 'e2e-cd-rt-qr-1' },
  });
  await page.goto(`/b/${ref}`);
  await expect(page.getByText('Confirmed', { exact: true }).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(`${RT_A} → ${RT_B}`).first()).toBeVisible();
  await expect(page.locator('body')).toContainText('10 Sep 2087');
  await expect(page.locator('body')).toContainText('Rp 200.000');
  await expect(page.getByAltText(/QR code for ticket/i)).toHaveCount(1);
});

// Bug B18 (docs/spikes/in-progress/BUGS_QA_BASELINE_FINDINGS.md): the booking page only reads the
// outbound leg (`getMainLeg`); `getReturnLeg` and `getAllLegsForBooking` are imported and never used.
// Remove test.fail when the return leg is shown.
test('BOOK-G09b a round-trip booking page also shows the return leg and its date', async ({ page }) => {
  test.fail(true, 'B18: the booking page shows only the outbound leg of a round-trip booking');
  await page.goto(`/b/${PREFIX}RT1`);
  await expect(page.getByText(`${RT_A} → ${RT_B}`).first()).toBeVisible({ timeout: 15_000 });
  // 14 Sep 2087 is the return leg's date; the "Book your return" suggestions print no year.
  await expect(page.locator('body')).toContainText('14 Sep 2087', { timeout: 3_000 });
});

test('BOOK-G09c a round-trip booking is not offered a return it already has', async ({ page }) => {
  test.fail(true, 'B18: the booking page suggests booking the return of a booking that already has one');
  await page.goto(`/b/${PREFIX}RT1`);
  await expect(page.getByText(`${RT_A} → ${RT_B}`).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/Book your return/)).toHaveCount(0, { timeout: 3_000 });
});

// ── Refund preview and the refund a cancellation queues (BOOK-G10) ──────────

const TIERS = [
  { key: 'full', ref: 'REF-FULL', text: /eligible for a 100% refund/, refund: 100_000, change: true },
  { key: 'partial', ref: 'REF-PART', text: /eligible for a 50% refund/, refund: 50_000, change: true },
  { key: 'none', ref: 'REF-NONE', text: /no refund per the policy/, refund: 0, change: false },
] as const;

test('BOOK-G10 the cancel card says what the refund will be, by how far off the departure is', async ({ page }) => {
  for (const t of TIERS) {
    await createConfirmedBooking(prisma, { reference: `${PREFIX}${t.ref}`, legId: refundLegs[t.key], operatorId, email: EMAIL });
    await page.goto(`/b/${PREFIX}${t.ref}`);
    await expect(page.getByRole('button', { name: 'Cancel booking' }), t.key).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(t.text), t.key).toBeVisible();
    // A date change is offered only more than 48 hours out.
    const change = page.getByRole('link', { name: 'Request date change' });
    await expect(change, t.key).toHaveCount(t.change ? 1 : 0);
  }
});

for (const t of TIERS) {
  test(`BOOK-G10b cancelling ${t.key === 'full' ? 'more than 7 days' : t.key === 'partial' ? '4 days' : 'under 48 hours'} out queues ${t.refund === 0 ? 'no refund' : `a refund of Rp ${t.refund.toLocaleString('id-ID')}`}`, async ({ page }) => {
    await page.goto(`/b/${PREFIX}${t.ref}`);
    await page.getByLabel('Confirm your email to cancel').fill(EMAIL);
    await page.getByRole('button', { name: 'Cancel booking' }).click();
    await page.waitForURL(/ok=cancelled/, { timeout: 15_000 });
    const booking = await row(`${PREFIX}${t.ref}`);
    expect(booking.status).toBe('CANCELLED_BY_CUSTOMER');
    if (t.refund === 0) {
      expect(booking.refund).toBeNull();
    } else {
      expect(booking.refund?.status).toBe('PENDING');
      expect(Number(booking.refund?.refundAmount)).toBe(t.refund);
    }
  });
}

// ── A pending reschedule request (BOOK-G11) ─────────────────────────────────

test('BOOK-G11 a booking with a pending date-change request says so and offers no second request button', async ({ page }) => {
  const ref = `${PREFIX}RESCH`;
  const booking = await mkBooking({ reference: ref, status: 'CONFIRMED', legId: reschedLegs.original });
  await prisma.rescheduleRequest.create({
    data: { bookingId: booking.id, originalLegId: reschedLegs.original, requestedLegId: reschedLegs.pending, status: 'PENDING' },
  });
  await page.goto(`/b/${ref}`);
  await expect(page.getByText('Reschedule request pending operator review')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('link', { name: 'Request date change' })).toHaveCount(0);
});

test('BOOK-G11b a second date-change request is refused while one is pending, and the first request is kept', async ({ page }) => {
  const ref = `${PREFIX}RESCH`;
  await page.goto(`/b/${ref}/reschedule?date=2087-10-12`);
  const form = page.locator('form').filter({ has: page.getByRole('button', { name: 'Request this' }) }).first();
  await expect(form).toBeVisible({ timeout: 15_000 });
  await form.locator('input[name="confirmEmail"]').fill(EMAIL);
  await form.getByRole('button', { name: 'Request this' }).click();
  await expect(page).toHaveURL(/error=A%20reschedule%20request%20is%20already%20pending/, { timeout: 15_000 });
  await expect(page.getByText('A reschedule request is already pending')).toBeVisible();
  const request = await prisma.rescheduleRequest.findFirstOrThrow({ where: { booking: { bookingReference: ref } } });
  expect(request.requestedLegId).toBe(reschedLegs.pending);
  expect(await prisma.rescheduleRequest.count({ where: { booking: { bookingReference: ref } } })).toBe(1);
});

