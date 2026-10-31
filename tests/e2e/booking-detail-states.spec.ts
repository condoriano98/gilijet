import { test, expect } from '@playwright/test';
import { loadEnvConfig } from '@next/env';
import { PrismaClient, type BookingStatus } from '@prisma/client';
import { requireMockPayments } from './support/mock-payments';
import { expectNoHorizontalOverflow, expectSubmitButtonsReachable } from './support/overflow';
import { removeBookings, removeSchedules } from './support/fixtures';

loadEnvConfig(process.cwd());
requireMockPayments();

/**
 * What the customer sees on `/b/<reference>` for each booking status, the
 * cancel form, the reference lookup, the reschedule guards, and where the
 * pay and checkout pages send a booking that cannot be paid. Bookings are
 * written straight to the database, one per state, so no payment is made.
 * `requireMockPayments()` skips the file when a live gateway key is set.
 *
 * Own route in 2087 (two open departures and one in 2001, always in the past),
 * removed afterwards together with the tickets, reschedule requests and
 * bookings. Relies on `pnpm seed:qa` (QA boat).
 */
const prisma = new PrismaClient();

const ORIGIN = 'E2E Detail Origin';
const DESTINATION = 'E2E Detail Dest';
const EMAIL = 'e2e-booking-detail@example.invalid';
const REF = {
  pending: 'E2E-DET-PEND',
  awaiting: 'E2E-DET-AWAIT',
  confirmed: 'E2E-DET-CONF',
  expired: 'E2E-DET-EXP',
  cancelled: 'E2E-DET-CANC',
  past: 'E2E-DET-PAST',
  cancelFlow: 'E2E-DET-FLOW',
  paidCancel: 'E2E-DET-PAIDC',
} as const;
const REFS = Object.values(REF);

let futureLegId: string;
let pastLegId: string;

test.describe.configure({ mode: 'serial' });

async function cleanup() {
  const bookings = await prisma.booking.findMany({ where: { bookingReference: { in: REFS } }, select: { id: true } });
  const ids = bookings.map((b) => b.id);
  await prisma.refund.deleteMany({ where: { bookingId: { in: ids } } });
  await prisma.rescheduleRequest.deleteMany({ where: { bookingId: { in: ids } } });
  await prisma.ticket.deleteMany({ where: { bookingId: { in: ids } } });
  await removeBookings(prisma, { bookingReference: { in: REFS } });
  await removeSchedules(prisma, [ORIGIN]);
}

test.beforeAll(async () => {
  await cleanup();
  const boat = await prisma.boat.findUniqueOrThrow({ where: { registrationNumber: 'QA-BOAT-001' } });
  const schedule = await prisma.schedule.create({
    data: {
      boatId: boat.id,
      originPort: ORIGIN,
      destinationPort: DESTINATION,
      departureTime: '09:00',
      durationMinutes: 45,
      basePrice: 100_000,
      daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
      status: 'ACTIVE',
    },
  });
  const mkLeg = (ymd: string, status: 'OPEN' | 'SAILED') =>
    prisma.leg.create({
      data: {
        scheduleId: schedule.id,
        operatorId: boat.operatorId,
        departureDate: new Date(`${ymd}T01:00:00Z`),
        basePrice: 100_000,
        status,
      },
    });
  futureLegId = (await mkLeg('2087-06-12', 'OPEN')).id;
  await mkLeg('2087-06-13', 'OPEN');
  pastLegId = (await mkLeg('2001-06-12', 'SAILED')).id;

  const mkBooking = (bookingReference: string, status: BookingStatus, legId: string) =>
    prisma.booking.create({
      data: {
        bookingReference,
        legId,
        operatorId: boat.operatorId,
        customerName: 'E2E Detail Customer',
        customerEmail: EMAIL,
        customerPhone: '+620000000000',
        totalAmount: 100_000,
        commissionAmount: 8_000,
        operatorAmount: 92_000,
        status,
        refundDeadline: new Date('2087-06-01T00:00:00Z'),
      },
    });
  await mkBooking(REF.pending, 'PENDING_PAYMENT', futureLegId);
  await mkBooking(REF.awaiting, 'AWAITING_CONFIRMATION', futureLegId);
  const confirmed = await mkBooking(REF.confirmed, 'CONFIRMED', futureLegId);
  await mkBooking(REF.expired, 'EXPIRED', futureLegId);
  await mkBooking(REF.cancelled, 'CANCELLED_BY_CUSTOMER', futureLegId);
  await mkBooking(REF.past, 'CONFIRMED', pastLegId);
  await mkBooking(REF.cancelFlow, 'PENDING_PAYMENT', futureLegId);
  await mkBooking(REF.paidCancel, 'AWAITING_CONFIRMATION', futureLegId);

  for (const n of [1, 2]) {
    await prisma.ticket.create({
      data: {
        bookingId: confirmed.id,
        ticketCode: `TK-2087-06-E2EDET-${n}`,
        passengerName: `E2E Passenger ${n}`,
        qrHash: `e2e-detail-qr-${n}`,
      },
    });
  }
});

test.afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

const badge = (page: import('@playwright/test').Page, text: string) => page.getByText(text, { exact: true }).first();

test('BOOK-D01 an unpaid booking offers to finish paying and to cancel', async ({ page }) => {
  await page.goto(`/b/${REF.pending}`);
  await expect(badge(page, 'Awaiting payment')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('link', { name: 'Complete payment' })).toHaveAttribute('href', `/pay/${REF.pending}`);
  await expect(page.getByRole('button', { name: 'Cancel booking' })).toBeVisible();
  await expect(page.getByAltText(/QR code for ticket/i)).toHaveCount(0);
});

test('BOOK-D02 a paid booking says the seat is being confirmed and shows no boarding pass', async ({ page }) => {
  await page.goto(`/b/${REF.awaiting}`);
  await expect(badge(page, 'Paid · confirming your seat')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/we.re confirming your seat/i).first()).toBeVisible();
  await expect(page.getByAltText(/QR code for ticket/i)).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Boarding pass PDF' })).toHaveCount(0);
});

test('BOOK-D03 a confirmed booking shows one QR per passenger, the PDF and calendar links, and the change-of-plans card', async ({ page }) => {
  await page.goto(`/b/${REF.confirmed}`);
  await expect(badge(page, 'Confirmed')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('heading', { name: 'Boarding passes' })).toBeVisible();
  await expect(page.getByAltText(/QR code for ticket/i)).toHaveCount(2);
  await expect(page.getByRole('link', { name: 'Boarding pass PDF' })).toHaveAttribute('href', `/api/bookings/${REF.confirmed}/boarding-pass`);
  await expect(page.getByRole('link', { name: 'Add to calendar' })).toHaveAttribute('href', `/api/bookings/${REF.confirmed}/ics`);
  await expect(page.getByRole('link', { name: 'Request date change' })).toHaveAttribute('href', `/b/${REF.confirmed}/reschedule`);
  await expect(page.getByRole('button', { name: 'Cancel booking' })).toBeVisible();
});

test('BOOK-D04 an expired booking can neither be paid nor cancelled', async ({ page }) => {
  await page.goto(`/b/${REF.expired}`);
  await expect(badge(page, 'Expired')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('link', { name: 'Complete payment' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Cancel booking' })).toHaveCount(0);
  await expect(page.getByAltText(/QR code for ticket/i)).toHaveCount(0);
});

test('BOOK-D05 a cancelled booking shows it is cancelled and offers no actions', async ({ page }) => {
  await page.goto(`/b/${REF.cancelled}`);
  await expect(badge(page, 'Cancelled')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Cancel booking' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Request date change' })).toHaveCount(0);
});

test('BOOK-D06 a confirmed booking whose departure has passed offers no cancel and no reschedule', async ({ page }) => {
  await page.goto(`/b/${REF.past}`);
  await expect(badge(page, 'Confirmed')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Cancel booking' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Request date change' })).toHaveCount(0);
});

test('BOOK-D07 an unknown reference shows the not-found page', async ({ page }) => {
  await page.goto('/b/E2E-NO-SUCH-BOOKING');
  // The status is 200 (streamed behind loading.tsx), but the visitor sees the
  // not-found page, not a booking.
  await expect(page.getByText('This page could not be found.')).toBeVisible();
});

test('BOOK-D08 cancelling needs the email on the booking', async ({ page }) => {
  await page.goto(`/b/${REF.cancelFlow}`);
  await page.getByLabel('Confirm your email to cancel').fill('someone-else@example.invalid');
  await page.getByRole('button', { name: 'Cancel booking' }).click();
  await page.waitForURL(/error=email_mismatch/, { timeout: 15_000 });
  await expect(page.getByText('email mismatch')).toBeVisible();
  const row = await prisma.booking.findUniqueOrThrow({ where: { bookingReference: REF.cancelFlow } });
  expect(row.status).toBe('PENDING_PAYMENT');
});

test('BOOK-D09 cancelling with the right email cancels the booking', async ({ page }) => {
  await page.goto(`/b/${REF.cancelFlow}`);
  await page.getByLabel('Confirm your email to cancel').fill(EMAIL);
  await page.getByRole('button', { name: 'Cancel booking' }).click();
  await page.waitForURL(/ok=cancelled/, { timeout: 15_000 });
  await expect(page.getByText(/Booking cancelled/)).toBeVisible();
  await expect(badge(page, 'Cancelled')).toBeVisible();
  const row = await prisma.booking.findUniqueOrThrow({ where: { bookingReference: REF.cancelFlow } });
  expect(row.status).toBe('CANCELLED_BY_CUSTOMER');
});

// Bug B9 (docs/spikes/todo/BUGS_QA_BASELINE_FINDINGS.md). The booking above was
// never paid, so there is nothing to give back.
test('BOOK-D09b cancelling a booking that was never paid creates no refund', async () => {
  const row = await prisma.booking.findUniqueOrThrow({ where: { bookingReference: REF.cancelFlow } });
  expect(await prisma.payment.count({ where: { bookingId: row.id, status: 'SUCCESSFUL' } })).toBe(0);
  expect(await prisma.refund.count({ where: { bookingId: row.id } })).toBe(0);
});

// The other side of B9: money that was taken is still owed back.
test('BOOK-D09c cancelling a paid booking still queues the refund', async ({ page }) => {
  await page.goto(`/b/${REF.paidCancel}`);
  await page.getByLabel('Confirm your email to cancel').fill(EMAIL);
  await page.getByRole('button', { name: 'Cancel booking' }).click();
  await page.waitForURL(/ok=cancelled/, { timeout: 15_000 });
  const row = await prisma.booking.findUniqueOrThrow({ where: { bookingReference: REF.paidCancel } });
  const refund = await prisma.refund.findUnique({ where: { bookingId: row.id } });
  expect(refund?.status).toBe('PENDING');
  expect(Number(refund?.refundAmount)).toBe(100_000);
});

test('BOOK-D10 reschedule: another traveller\'s email is refused', async ({ page }) => {
  await page.goto(`/b/${REF.confirmed}/reschedule?date=2087-06-13`);
  const form = page.locator('form').filter({ has: page.getByRole('button', { name: 'Request this' }) }).first();
  await expect(form).toBeVisible({ timeout: 15_000 });
  await form.locator('input[name="confirmEmail"]').fill('someone-else@example.invalid');
  await form.getByRole('button', { name: 'Request this' }).click();
  await expect(page).toHaveURL(/error=Email%20does%20not%20match%20booking/, { timeout: 15_000 });
  expect(await prisma.rescheduleRequest.count({ where: { booking: { bookingReference: REF.confirmed } } })).toBe(0);
});

test('BOOK-D11 reschedule: a booking that is not confirmed is sent back to its page', async ({ page }) => {
  await page.goto(`/b/${REF.awaiting}/reschedule`);
  await page.waitForURL(new RegExp(`/b/${REF.awaiting}$`), { timeout: 15_000 });
});

test('BOOK-D12 pay: a mock-mode booking is sent on to the test checkout, a settled one back to its page', async ({ page }) => {
  await page.goto(`/pay/${REF.pending}`);
  await page.waitForURL(new RegExp(`/checkout/${REF.pending}`), { timeout: 15_000 });
  await expect(page.getByText('TEST MODE')).toBeVisible();

  await page.goto(`/pay/${REF.confirmed}`);
  await page.waitForURL(new RegExp(`/b/${REF.confirmed}$`), { timeout: 15_000 });
  await page.goto(`/pay/${REF.expired}`);
  await page.waitForURL(new RegExp(`/b/${REF.expired}$`), { timeout: 15_000 });
});

test('BOOK-D13 checkout: a booking that is not waiting for payment is sent back to its page', async ({ page }) => {
  await page.goto(`/checkout/${REF.confirmed}`);
  await page.waitForURL(new RegExp(`/b/${REF.confirmed}$`), { timeout: 15_000 });
});

test('BOOK-D14 pay and checkout: an unknown reference is a 404', async ({ page }) => {
  const pay = await page.goto('/pay/E2E-NO-SUCH-BOOKING');
  expect(pay?.status()).toBe(404);
  const checkout = await page.goto('/checkout/E2E-NO-SUCH-BOOKING');
  expect(checkout?.status()).toBe(404);
});

test('BOOK-M02 a booking page fits the screen and its buttons can be tapped', async ({ page }) => {
  // Bug B12 (docs/spikes/in-progress/BUGS_QA_BASELINE_FINDINGS.md): on a 375 px
  // phone this page is 391 px wide, so it scrolls sideways. Remove the line
  // below when it is fixed.
  test.fail(test.info().project.name === 'mobile-flow', 'known: /b/<reference> is 16 px wider than a 375 px phone');
  for (const ref of [REF.pending, REF.confirmed, REF.awaiting]) {
    await page.goto(`/b/${ref}`);
    await expect(page.locator('body')).toContainText(ref);
    await expectNoHorizontalOverflow(page);
    await expectSubmitButtonsReachable(page);
  }
});
