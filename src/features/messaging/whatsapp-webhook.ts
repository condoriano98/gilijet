import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Meta WhatsApp Cloud API webhook helpers. Pure, no I/O: the route in
 * src/app/api/webhooks/whatsapp/route.ts does the bookkeeping.
 */

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/**
 * Meta's one-off subscription check: GET with `hub.mode=subscribe`, our verify
 * token and a challenge to echo back. Returns the challenge, or null when the
 * request is not a valid check.
 */
export function verifyChallenge(
  params: URLSearchParams,
  verifyToken: string | undefined,
): string | null {
  const token = verifyToken?.trim();
  if (!token) return null;
  if (params.get('hub.mode') !== 'subscribe') return null;
  const given = params.get('hub.verify_token');
  const challenge = params.get('hub.challenge');
  if (!given || !challenge || !safeEqual(given, token)) return null;
  return challenge;
}

/**
 * `X-Hub-Signature-256` is `sha256=` + HMAC-SHA256 of the raw body keyed with
 * the app secret. Computed over the original bytes, not re-serialised JSON.
 */
export function verifySignature(
  rawBody: string,
  header: string | null,
  appSecret: string | undefined,
): boolean {
  const secret = appSecret?.trim();
  if (!secret || !header?.startsWith('sha256=')) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  return safeEqual(header.slice('sha256='.length), expected);
}

export type WhatsappStatusUpdate = {
  /** Meta message id (wamid…). */
  id: string;
  status: string;
  timestamp: string | null;
  /** Meta's own reason when status is `failed`. */
  error: string | null;
};

type Change = {
  value?: {
    statuses?: Array<{
      id?: string;
      status?: string;
      timestamp?: string;
      errors?: Array<{ code?: number; title?: string; message?: string }>;
    }>;
    messages?: unknown[];
  };
};

function changesOf(payload: unknown): Change[] {
  const entries = (payload as { entry?: Array<{ changes?: Change[] }> })?.entry;
  if (!Array.isArray(entries)) return [];
  return entries.flatMap((e) => (Array.isArray(e.changes) ? e.changes : []));
}

/**
 * Delivery status of messages we sent (`sent` / `delivered` / `read` /
 * `failed`). Recipient numbers and message text are deliberately dropped:
 * the log is for diagnosing delivery, not for keeping customer content.
 */
export function extractStatuses(payload: unknown): WhatsappStatusUpdate[] {
  const out: WhatsappStatusUpdate[] = [];
  for (const change of changesOf(payload)) {
    for (const s of change.value?.statuses ?? []) {
      if (!s.id || !s.status) continue;
      const first = s.errors?.[0];
      out.push({
        id: s.id,
        status: s.status,
        timestamp: s.timestamp ?? null,
        error: first
          ? [first.code, first.title ?? first.message].filter(Boolean).join(' ')
          : null,
      });
    }
  }
  return out;
}

/** Number of inbound messages in the delivery (not stored: we only count them). */
export function countInboundMessages(payload: unknown): number {
  return changesOf(payload).reduce(
    (n, c) => n + (Array.isArray(c.value?.messages) ? c.value!.messages!.length : 0),
    0,
  );
}
