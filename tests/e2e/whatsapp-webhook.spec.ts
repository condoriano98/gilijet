import { createHmac } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { loadEnvConfig } from '@next/env';
import { PrismaClient } from '@prisma/client';

loadEnvConfig(process.cwd());

/**
 * Meta WhatsApp webhook: the verification handshake Meta runs when the callback
 * URL is saved, signature checking, and that a delivery status lands in the
 * webhook log. Needs WHATSAPP_WEBHOOK_VERIFY_TOKEN and WHATSAPP_APP_SECRET on the
 * dev server, otherwise it skips itself. Own event rows (`wamid.E2E…`), removed
 * afterwards. Never calls Meta.
 */
const prisma = new PrismaClient();
const TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN?.trim();
const SECRET = process.env.WHATSAPP_APP_SECRET?.trim();
const REF = `wamid.E2E${Date.now()}`;
const PATH = '/api/webhooks/whatsapp';

test.skip(!TOKEN || !SECRET, 'WHATSAPP_WEBHOOK_VERIFY_TOKEN / WHATSAPP_APP_SECRET are not set');
test.describe.configure({ mode: 'serial' });

const sign = (body: string) => 'sha256=' + createHmac('sha256', SECRET!).update(body).digest('hex');
const statusBody = (status: string) =>
  JSON.stringify({
    entry: [{ changes: [{ value: { statuses: [{ id: REF, status, timestamp: '1' }] } }] }],
  });

test.afterAll(async () => {
  await prisma.webhookEvent.deleteMany({ where: { provider: 'whatsapp', externalRef: REF } });
  await prisma.$disconnect();
});

test('Meta verification: the right token gets the challenge back, a wrong one is refused', async ({ request }) => {
  const ok = await request.get(`${PATH}?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(TOKEN!)}&hub.challenge=424242`);
  expect(ok.status()).toBe(200);
  expect(await ok.text()).toBe('424242');

  const bad = await request.get(`${PATH}?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=424242`);
  expect(bad.status()).toBe(403);
});

test('an unsigned or wrongly signed delivery is refused', async ({ request }) => {
  const body = statusBody('delivered');
  expect((await request.post(PATH, { data: body })).status()).toBe(401);
  expect(
    (await request.post(PATH, { data: body, headers: { 'x-hub-signature-256': 'sha256=deadbeef' } })).status(),
  ).toBe(401);
});

test('a signed delivery status is acknowledged and logged once', async ({ request }) => {
  const body = statusBody('delivered');
  const headers = { 'x-hub-signature-256': sign(body), 'content-type': 'application/json' };
  expect((await request.post(PATH, { data: body, headers })).status()).toBe(200);
  expect((await request.post(PATH, { data: body, headers })).status()).toBe(200); // redelivery

  const rows = await prisma.webhookEvent.findMany({ where: { provider: 'whatsapp', externalRef: REF } });
  expect(rows).toHaveLength(1);
  expect(rows[0].eventType).toBe('message.delivered');
  expect(rows[0].status).toBe('PROCESSED');
});
