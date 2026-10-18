import { test, expect, type Page } from '@playwright/test';
import { loadEnvConfig } from '@next/env';
import { PrismaClient } from '@prisma/client';
import { createHmac } from 'node:crypto';
import { requireMockPayments } from './support/mock-payments';
import { removeBookings, removeSchedules } from './support/fixtures';

loadEnvConfig(process.cwd());
requireMockPayments();

/**
 * E-ticket Part B: the operator's ticket email, auto-forwarded to our Resend
 * inbound address, reaches /api/webhooks/resend-inbound and is forwarded to the
 * buyer; an email that cannot be matched waits on /admin/eticket-delivery.
 *
 * Messaging keys are blanked (requireMockPayments), so the processor reads the
 * email from `data.mock_email` and the forward is only logged; what is asserted
 * is the webhook answer, the `operator_ticket_forwarded` audit row and what the
 * admin page shows. Needs RESEND_INBOUND_SECRET in the dev server's env (the
 * spec signs with the same value) and skips itself otherwise.
 * Builds its own route (2096), booking and PIC row and removes them.
 * Relies on `pnpm seed:qa` (boat and admin account).
 */
const prisma = new PrismaClient();
const SECRET = process.env.RESEND_INBOUND_SECRET?.trim();
test.skip(!SECRET, 'RESEND_INBOUND_SECRET is not set');
test.describe.configure({ mode: 'serial' });

const ORIGIN = 'E2E Op Mail Origin';
const REF = 'BK-2096-06-PQMAL2';
const SENDER = 'e2e-wahana@example.invalid';
const EMAIL_IDS = ['e2e-em-code', 'e2e-em-dup', 'e2e-em-stranger', 'e2e-em-lost'];
const DEPARTURE_UTC = new Date('2096-06-12T01:00:00Z'); // 12 Jun 2096 09:00 WITA

function signed(body: object) {
  const raw = JSON.stringify(body);
  const id = `msg_${Math.random().toString(36).slice(2)}`;
  const ts = Math.floor(Date.now() / 1000);
  const key = Buffer.from(SECRET!.replace(/^whsec_/, ''), 'base64');
  const sig = createHmac('sha256', key).update(`${id}.${ts}.${raw}`).digest('base64');
  return { raw, headers: { 'svix-id': id, 'svix-timestamp': String(ts), 'svix-signature': `v1,${sig}`, 'content-type': 'application/json' } };
}

const event = (emailId: string, mock: { from: string; subject: string; message_id: string; text: string }) => ({
  type: 'email.received',
  data: {
    email_id: emailId,
    mock_email: { ...mock, attachments: [{ filename: 'ticket.pdf', content_base64: Buffer.from('%PDF-1.4 e2e').toString('base64') }] },
  },
});

async function cleanup() {
  const bookings = await prisma.booking.findMany({ where: { bookingReference: REF }, select: { id: true } });
  await prisma.auditLog.deleteMany({ where: { entityId: { in: bookings.map((b) => b.id) } } });
  await prisma.webhookEvent.deleteMany({ where: { provider: 'resend-inbound', externalRef: { in: EMAIL_IDS } } });
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
  await page.getByLabel(/email/i).fill('qa-admin@gilifast.local');
  await page.getByLabel(/password/i).fill('qaqaqaqa');
  await page.getByRole('button', { name: /log ?in|sign ?in/i }).click();
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 20_000 });
}

test('a bad signature is refused and an unsigned call forwards nothing', async ({ request }) => {
  const { raw } = signed(event('e2e-em-stranger', { from: SENDER, subject: 'x', message_id: '<bad>', text: `Hi A ${REF}` }));
  const res = await request.post('/api/webhooks/resend-inbound', {
    data: raw,
    headers: { 'svix-id': 'x', 'svix-timestamp': String(Math.floor(Date.now() / 1000)), 'svix-signature': 'v1,AAAA', 'content-type': 'application/json' },
  });
  expect(res.status()).toBe(401);
});

test('an email with our booking code is forwarded to the buyer, once', async ({ request }) => {
  const body = event('e2e-em-code', {
    from: `Wahana <${SENDER}>`,
    subject: 'Fwd: E-Ticket Wahana',
    message_id: '<e2e-code@wahana>',
    text: `Hi E2E Mail Buyer ${REF.toLowerCase()},\nSanur → Nusa Penida · 12 Jun 2096 09:00`,
  });
  const first = signed(body);
  const res = await request.post('/api/webhooks/resend-inbound', { data: first.raw, headers: first.headers });
  expect(res.status()).toBe(200);
  expect((await res.json()).status).toBe('forwarded');

  const booking = await prisma.booking.findUniqueOrThrow({ where: { bookingReference: REF }, include: { tickets: true } });
  const rows = await prisma.auditLog.findMany({ where: { entityId: booking.id, action: 'operator_ticket_forwarded' } });
  expect(rows).toHaveLength(1);
  expect(rows[0].newState).toMatchObject({ matchedBy: 'code', leg: 'one-way', attachments: 1 });
  // Forwarding does not touch the booking: the admin still confirms.
  expect(booking.status).toBe('AWAITING_CONFIRMATION');
  expect(booking.tickets).toHaveLength(0);

  // Same Resend event delivered again, and the same Message-ID under a new email id: neither forwards again.
  const again = signed(body);
  expect((await (await request.post('/api/webhooks/resend-inbound', { data: again.raw, headers: again.headers })).json()).idempotent).toBe(true);
  const dup = signed(event('e2e-em-dup', { from: SENDER, subject: 'E-Ticket Wahana', message_id: '<e2e-code@wahana>', text: `Hi E2E Mail Buyer ${REF}` }));
  expect((await (await request.post('/api/webhooks/resend-inbound', { data: dup.raw, headers: dup.headers })).json()).status).toBe('already-forwarded');
  expect(await prisma.auditLog.count({ where: { entityId: booking.id, action: 'operator_ticket_forwarded' } })).toBe(1);
});

test('mail from a stranger is skipped and nothing is forwarded', async ({ request }) => {
  const s = signed(event('e2e-em-stranger', { from: 'stranger@evil.test', subject: 'E-Ticket', message_id: '<e2e-stranger>', text: `Hi A ${REF}` }));
  const res = await request.post('/api/webhooks/resend-inbound', { data: s.raw, headers: s.headers });
  expect((await res.json()).status).toBe('sender-not-allowed');
  const ev = await prisma.webhookEvent.findFirstOrThrow({ where: { provider: 'resend-inbound', externalRef: 'e2e-em-stranger' } });
  expect(ev.status).toBe('SKIPPED');
});

test('an email without a code that matches nothing waits for the admin, who forwards it', async ({ request, page }) => {
  const s = signed(event('e2e-em-lost', { from: SENDER, subject: 'E-Ticket lost', message_id: '<e2e-lost>', text: 'Hi Nobody Known,\nSanur → Nusa Penida · 01 Jan 2096 09:00' }));
  const res = await request.post('/api/webhooks/resend-inbound', { data: s.raw, headers: s.headers });
  expect(res.status()).toBe(200); // acknowledged, so Resend does not redeliver
  expect((await prisma.webhookEvent.findFirstOrThrow({ where: { externalRef: 'e2e-em-lost' } })).status).toBe('FAILED');

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
