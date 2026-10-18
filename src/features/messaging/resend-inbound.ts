import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '@/shared/server/env';
import type { EmailAttachment } from '@/features/messaging/email';

/**
 * Receiving side of Resend: webhook verification and fetching a received email.
 * The webhook itself carries metadata only; body and attachments come from the
 * Receiving API. Docs: https://resend.com/docs/dashboard/receiving/introduction
 */

const TOLERANCE_SECONDS = 5 * 60;
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

/**
 * Resend signs webhooks with Svix: HMAC-SHA256 over `${id}.${timestamp}.${body}`
 * keyed by the base64 part of the `whsec_…` secret, sent as space-separated
 * `v1,<base64>` candidates. Fails closed when no secret is configured.
 */
export function verifyResendWebhook(args: {
  headers: Headers;
  rawBody: string;
  secret: string | undefined;
  nowMs?: number;
}): boolean {
  const { headers, rawBody, secret } = args;
  if (!secret) return false;
  const id = headers.get('svix-id');
  const timestamp = headers.get('svix-timestamp');
  const signatures = headers.get('svix-signature');
  if (!id || !timestamp || !signatures) return false;

  if (!/^\d{1,12}$/.test(timestamp)) return false;
  const ts = Number(timestamp);
  const now = Math.floor((args.nowMs ?? Date.now()) / 1000);
  if (Math.abs(now - ts) > TOLERANCE_SECONDS) return false;

  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  if (key.length === 0) return false;
  const expected = createHmac('sha256', key)
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest();

  return signatures.split(' ').some((candidate) => {
    const [version, sig] = candidate.split(',');
    if (version !== 'v1' || !sig) return false;
    const got = Buffer.from(sig, 'base64');
    return got.length === expected.length && timingSafeEqual(got, expected);
  });
}

export type ReceivedEmail = {
  id: string;
  from: string;
  subject: string;
  messageId: string | null;
  text: string;
  html: string | null;
  attachments: EmailAttachment[];
};

type MockEmail = {
  from: string;
  subject: string;
  message_id?: string;
  text?: string;
  html?: string;
  attachments?: Array<{ filename: string; content_base64: string }>;
};

/** Basename only, no control characters, bounded length. */
function safeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  return base.replace(/[\u0000-\u001f]/g, '').slice(0, 120) || 'ticket.pdf';
}

async function resendGet<T>(path: string): Promise<T> {
  const res = await fetch(`https://api.resend.com${path}`, {
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}` },
  });
  if (!res.ok) {
    throw new Error(`Resend ${path} failed ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

/**
 * Load the email a verified `email.received` webhook points at. Without
 * RESEND_API_KEY (dev, CI, staging) the email is read from `data.mock_email` in
 * the payload instead, so the whole flow is testable offline; production always
 * has the key, so that branch never runs there.
 */
export async function loadReceivedEmail(payload: Record<string, unknown>): Promise<ReceivedEmail> {
  const data = (payload.data ?? {}) as Record<string, unknown>;
  const id = String(data.email_id ?? '');
  if (!id) throw new Error('Webhook has no email_id');

  if (!env.RESEND_API_KEY) {
    if (process.env.NODE_ENV === 'production') throw new Error('RESEND_API_KEY is not set');
    const mock = data.mock_email as MockEmail | undefined;
    if (!mock) throw new Error('No RESEND_API_KEY and no mock_email in payload');
    return {
      id,
      from: mock.from,
      subject: mock.subject,
      messageId: mock.message_id ?? null,
      text: mock.text ?? '',
      html: mock.html ?? null,
      attachments: (mock.attachments ?? []).map((a) => ({
        filename: a.filename,
        content: Buffer.from(a.content_base64, 'base64'),
      })),
    };
  }

  const email = await resendGet<{
    from: string;
    subject?: string;
    message_id?: string;
    text?: string | null;
    html?: string | null;
  }>(`/emails/receiving/${id}`);

  const list = await resendGet<{
    data: Array<{ filename: string; size?: number; download_url: string }>;
  }>(`/emails/receiving/${id}/attachments`);

  const attachments: EmailAttachment[] = [];
  let total = 0;
  for (const a of list.data) {
    total += a.size ?? 0;
    if (total > MAX_ATTACHMENT_BYTES) throw new Error('Attachments are larger than 20 MB');
    const url = new URL(a.download_url);
    if (url.protocol !== 'https:') throw new Error(`Attachment ${a.filename} has a non-https URL`);
    const res = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`Attachment ${a.filename} download failed ${res.status}`);
    const content = Buffer.from(await res.arrayBuffer());
    // `size` may be absent, so the cap is also enforced on what was downloaded.
    if (!a.size) total += content.length;
    if (total > MAX_ATTACHMENT_BYTES) throw new Error('Attachments are larger than 20 MB');
    attachments.push({ filename: safeFilename(a.filename), content });
  }

  return {
    id,
    from: email.from,
    subject: email.subject ?? '',
    messageId: email.message_id ?? null,
    text: email.text ?? '',
    html: email.html ?? null,
    attachments,
  };
}
