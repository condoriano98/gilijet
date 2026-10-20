import { test, expect, type Page } from '@playwright/test';
import { loadEnvConfig } from '@next/env';
import { PrismaClient } from '@prisma/client';
import { requireMockPayments } from './support/mock-payments';
import { removeBookings, removeSchedules } from './support/fixtures';

loadEnvConfig(process.cwd());
requireMockPayments();

/**
 * E-ticket Part B: the operator's ticket email, read from the admin@ mailbox over
 * IMAP, is forwarded to the buyer; an email that cannot be matched waits on
 * /admin/eticket-delivery.
 *
 * IMAP itself is not exercised here (it would read a real mailbox; see the
 * poller unit tests and the QC notes in the spike doc). The spec stores the
 * WebhookEvent the poller would have written, with the email in
 * `data.mock_email`, and drives it through the same paths production uses:
 * the admin Retry button and the admin page. The keys are blanked
 * (requireMockPayments), so the processor reads the mock email and the forward
 * is only logged; what is asserted is the event outcome, the
 * `operator_ticket_forwarded` audit row and what the admin page shows. Also
 * checks the poll route's auth. Builds its own route (2096), booking and PIC row
 * and removes them. Relies on `pnpm seed:qa` (boat and admin account), and on
 * CRON_SECRET in the dev server's env (skips itself otherwise).
 */
const prisma = new PrismaClient();
const CRON_SECRET = process.env.CRON_SECRET?.trim();
test.skip(!CRON_SECRET, 'CRON_SECRET is not set');
test.describe.configure({ mode: 'serial' });

const ORIGIN = 'E2E Op Mail Origin';
const REF = 'BK-2096-06-PQMAL2';
const SENDER = 'e2e-wahana@example.invalid';
const EMAIL_IDS = ['e2e-em-code', 'e2e-em-dup', 'e2e-em-stranger', 'e2e-em-lost', 'e2e-em-nopdf'];
const DEPARTURE_UTC = new Date('2096-06-12T01:00:00Z'); // 12 Jun 2096 09:00 WITA
const PDF = [{ filename: 'ticket.pdf', content_base64: Buffer.from('%PDF-1.4 e2e').toString('base64') }];

type Mock = { from: string; subject: string; message_id: string; text: string; attachments?: typeof PDF; authenticated?: boolean };

/** Store the event the poller would write, ready for the retry cron to pick up. */
async function storeEvent(emailId: string, mock: Mock) {
  await prisma.webhookEvent.create({
    data: {
      provider: 'imap-inbox',
      eventType: 'email.received',
      externalRef: emailId,
      status: 'FAILED',
      attempts: 1,
      lastAttemptAt: new Date(Date.now() - 10 * 60 * 1000),
      errorMessage: 'queued by e2e',
      rawPayload: {
        type: 'email.received',
        data: { email_id: emailId, from: mock.from, subject: mock.subject, mock_email: { attachments: PDF, ...mock } },
      },
    },
  });
}

/** Run one stored event through the admin Retry button (the retry cron would sweep every FAILED event of the shared DB). */
async function retryViaAdmin(page: Page, emailId: string) {
  await login(page);
  await page.goto(`/admin/webhooks?q=${emailId}`);
  const row = page.getByRole('row', { name: new RegExp(emailId) });
  await row.getByRole('button', { name: 'Retry' }).click();
  await expect(page.locator('body')).toContainText(/Event processed\.|Retry ran/, { timeout: 15_000 });
}

const eventFor = (emailId: string) => prisma.webhookEvent.findFirstOrThrow({ where: { provider: 'imap-inbox', externalRef: emailId } });

async function cleanup() {
  const bookings = await prisma.booking.findMany({ where: { bookingReference: REF }, select: { id: true } });
  await prisma.auditLog.deleteMany({ where: { entityId: { in: bookings.map((b) => b.id) } } });
  await prisma.webhookEvent.deleteMany({ where: { provider: 'imap-inbox', externalRef: { in: EMAIL_IDS } } });
  await removeBookings(prisma, { bookingReference: REF });
  await removeSchedules(prisma, [ORIGIN]);
  await prisma.operatorPicContact.deleteMany({ where: { emailKonfirmasiTrigger: SENDER } });
}

test.beforeAll(async () => {
  await cleanup();
  const boat = await prisma.boat.findUniqueOrThrow({ where: { registrationNumber: 'QA-BOAT-001' } });
  const schedule = await prisma.schedule.create({
    data: {
      boatId: boat.id, originPort: ORIGIN, destinationPort: 'E2E Op Mail Dest', departureTime: '09:00',
      durationMinutes: 45, basePrice: 100_000, daysOfWeek: [1, 2, 3, 4, 5, 6, 7], status: 'ACTIVE',
    },
  });
  const leg = await prisma.leg.create({
    data: { scheduleId: schedule.id, operatorId: boat.operatorId, departureDate: DEPARTURE_UTC, basePrice: 100_000, status: 'OPEN' },
  });
  await prisma.booking.create({
    data: {
      operatorId: boat.operatorId, bookingReference: REF, legId: leg.id,
      customerName: 'E2E Mail Buyer', customerEmail: 'e2e-op-mail@example.invalid', customerPhone: '+620000000000',
      totalAmount: 100_000, commissionAmount: 8_000, operatorAmount: 92_000, status: 'AWAITING_CONFIRMATION',
      refundDeadline: new Date('2096-06-05T00:00:00Z'),
      notes: JSON.stringify({ passengers: [{ name: 'E2E Mail Buyer', type: 'ADULT' }] }),
      payment: { create: { amount: 100_000, method: 'BANK_TRANSFER', status: 'SUCCESSFUL' } },
    },
  });
  await prisma.auditLog.create({
    data: { entityType: 'BOOKING', entityId: (await prisma.booking.findUniqueOrThrow({ where: { bookingReference: REF } })).id, action: 'pic_order_notified', userRole: 'SYSTEM', newState: { recipients: 1, delivered: 0 } },
  });
  await prisma.operatorPicContact.create({ data: { operatorId: boat.operatorId, emailKonfirmasiTrigger: SENDER } });
});

test.afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

async function login(page: Page) {
  await page.goto('/admin/login');
  // Already signed in (a second call in the same test): the login page redirects.
  if (!new URL(page.url()).pathname.includes('/login')) return;
  await page.getByLabel(/email/i).fill('qa-admin@gilifast.local');
  await page.getByLabel(/password/i).fill('qaqaqaqa');
  await page.getByRole('button', { name: /log ?in|sign ?in/i }).click();
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 20_000 });
}

test('the poll route refuses a missing or wrong secret', async ({ request }) => {
  expect((await request.get('/api/cron/poll-operator-inbox')).status()).toBe(401);
  expect((await request.get('/api/cron/poll-operator-inbox', { headers: { authorization: 'Bearer wrong' } })).status()).toBe(401);
});

test('with no mailbox configured the poll route is a harmless no-op', async ({ request }) => {
  const res = await request.get('/api/cron/poll-operator-inbox', { headers: { authorization: `Bearer ${CRON_SECRET}` } });
  expect(res.status()).toBe(200);
  expect(await res.json()).toMatchObject({ ok: true, configured: false, forwarded: 0 });
});

test('an email with our booking code is forwarded to the buyer, once', async ({ page }) => {
  await storeEvent('e2e-em-code', {
    from: SENDER,
    subject: 'Fwd: E-Ticket Wahana',
    message_id: '<e2e-code@wahana>',
    text: `Hi E2E Mail Buyer ${REF.toLowerCase()},\nSanur → Nusa Penida · 12 Jun 2096 09:00`,
  });
  await retryViaAdmin(page, 'e2e-em-code');
  expect((await eventFor('e2e-em-code')).status).toBe('PROCESSED');

  const booking = await prisma.booking.findUniqueOrThrow({ where: { bookingReference: REF }, include: { tickets: true } });
  const rows = await prisma.auditLog.findMany({ where: { entityId: booking.id, action: 'operator_ticket_forwarded' } });
  expect(rows).toHaveLength(1);
  expect(rows[0].newState).toMatchObject({ matchedBy: 'code', leg: 'one-way', attachments: 1 });
  // Forwarding does not touch the booking: the admin still confirms.
  expect(booking.status).toBe('AWAITING_CONFIRMATION');
  expect(booking.tickets).toHaveLength(0);

  // The same Message-ID under another event: not forwarded again.
  await storeEvent('e2e-em-dup', { from: SENDER, subject: 'E-Ticket Wahana', message_id: '<e2e-code@wahana>', text: `Hi E2E Mail Buyer ${REF}` });
  await retryViaAdmin(page, 'e2e-em-dup');
  expect((await eventFor('e2e-em-dup')).status).toBe('PROCESSED');
  expect(await prisma.auditLog.count({ where: { entityId: booking.id, action: 'operator_ticket_forwarded' } })).toBe(1);
});

test('mail from a stranger is skipped and nothing is forwarded', async ({ page }) => {
  await storeEvent('e2e-em-stranger', { from: 'stranger@evil.test', subject: 'E-Ticket', message_id: '<e2e-stranger>', text: `Hi A ${REF}` });
  await retryViaAdmin(page, 'e2e-em-stranger');
  expect((await eventFor('e2e-em-stranger')).status).toBe('SKIPPED');
});

test('an email without a PDF waits for the admin and nothing is forwarded', async ({ page }) => {
  await storeEvent('e2e-em-nopdf', { from: SENDER, subject: 'E-Ticket', message_id: '<e2e-nopdf>', text: `Hi E2E Mail Buyer ${REF}`, attachments: [] });
  await retryViaAdmin(page, 'e2e-em-nopdf');
  const ev = await eventFor('e2e-em-nopdf');
  expect(ev.status).toBe('FAILED');
  expect(ev.errorMessage).toBe('Needs review: No PDF attached');
  const booking = await prisma.booking.findUniqueOrThrow({ where: { bookingReference: REF } });
  expect(await prisma.auditLog.count({ where: { action: 'operator_ticket_forwarded', entityId: booking.id } })).toBe(1);
});

test('an email without a code that matches nothing waits for the admin, who forwards it', async ({ page }) => {
  await storeEvent('e2e-em-lost', { from: SENDER, subject: 'E-Ticket lost', message_id: '<e2e-lost>', text: 'Hi Nobody Known,\nSanur → Nusa Penida · 01 Jan 2096 09:00' });
  await retryViaAdmin(page, 'e2e-em-lost');
  expect((await eventFor('e2e-em-lost')).status).toBe('FAILED');

  await login(page);
  await page.goto('/admin/eticket-delivery');
  const row = page.getByRole('row', { name: /Nobody Known/ });
  await expect(row).toContainText('no paid booking matches', { timeout: 15_000 });
  await row.getByPlaceholder('BK-2026-10-ABC234').fill(REF);
  await row.getByRole('button', { name: 'Forward' }).click();
  await expect(page.locator('body')).toContainText('Forwarded to the customer.', { timeout: 15_000 });
  await expect(page.getByRole('row', { name: /Nobody Known/ })).toHaveCount(0);

  const booking = await prisma.booking.findUniqueOrThrow({ where: { bookingReference: REF } });
  expect(await prisma.auditLog.count({ where: { entityId: booking.id, action: 'operator_ticket_forwarded' } })).toBe(2);
  await expect(page.getByRole('row', { name: new RegExp(REF) }).filter({ hasText: 'admin' })).toHaveCount(1);
});
