import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { env } from '@/shared/server/env';
import type { EmailAttachment } from '@/features/messaging/email';

/**
 * Reading side of the mailbox: IMAP connection, parsing a raw message, and the
 * sender-authentication check. The mailbox is only ever opened read-only; what
 * has been handled is tracked in WebhookEvent rows, not in IMAP flags, because
 * people also read this inbox and a human opening a mail must not hide it.
 */

export const MAX_MESSAGE_BYTES = 15 * 1024 * 1024;
const MAX_ATTACHMENT_BYTES = 12 * 1024 * 1024;
const MAX_ATTACHMENTS = 5;

export type ReceivedEmail = {
  id: string;
  from: string;
  subject: string;
  messageId: string | null;
  text: string;
  html: string | null;
  attachments: EmailAttachment[];
  /** The receiving server vouches for the sender (DMARC, or DKIM aligned with From). */
  authenticated: boolean;
};

/** The message an event points at cannot be read from the mailbox any more (moved, deleted, mailbox reset, too large). */
export class MessageGoneError extends Error {}

export type ImapRef = { uidValidity: string; uid: number };

export function inboxConfigured(): boolean {
  return Boolean(env.INBOX_IMAP_HOST && env.INBOX_IMAP_USER && env.INBOX_IMAP_PASSWORD);
}

export function openInbox(): ImapFlow {
  const client = new ImapFlow({
    host: env.INBOX_IMAP_HOST!,
    port: env.INBOX_IMAP_PORT,
    secure: true,
    auth: { user: env.INBOX_IMAP_USER!, pass: env.INBOX_IMAP_PASSWORD! },
    logger: false,
    // A serverless function has a hard time limit: fail fast instead of hanging.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
  });
  // Without a listener an IMAP socket error would crash the process.
  client.on('error', (err: Error) => console.error('[inbox] IMAP error:', err.message));
  return client;
}

/** Basename only, no control characters, bounded length. */
export function safeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  return base.replace(/[\u0000-\u001f]/g, '').slice(0, 120) || 'ticket.pdf';
}

/**
 * Gmail writes an `Authentication-Results: mx.google.com; dkim=pass
 * header.i=@x.com; spf=pass …; dmarc=pass …` header on every message it
 * receives. Only the topmost one counts (added last, by our own server); a
 * sender can paste extra ones lower down. The mail is trusted when DMARC passed,
 * or DKIM passed for the From domain itself (some operators publish no DMARC).
 */
export function isAuthenticated(authResultsHeaders: string[], fromAddress: string): boolean {
  const top = authResultsHeaders[0];
  if (!top || !/^\s*mx\.google\.com\s*;/i.test(top)) return false;

  const domain = fromAddress.split('@')[1]?.toLowerCase();
  if (!domain) return false;
  // DMARC pass counts only for the domain we are going to trust: Gmail names it
  // in header.from.
  const dmarc = top.split(';').find((part) => /\bdmarc=pass\b/i.test(part));
  if (dmarc) {
    const hf = dmarc.match(/header\.from=([^\s;]+)/i)?.[1]?.toLowerCase();
    if (hf === domain) return true;
  }
  return top.split(';').some((part) => {
    if (!/\bdkim=pass\b/i.test(part)) return false;
    // Gmail names the signing domain in header.i (`@x.com`), other servers in header.d.
    const d = (
      part.match(/header\.d=([^\s;]+)/i)?.[1] ?? part.match(/header\.i=[^\s@;]*@([^\s;]+)/i)?.[1]
    )?.toLowerCase();
    return d !== undefined && (d === domain || domain.endsWith(`.${d}`));
  });
}

export async function parseRawEmail(source: Buffer, id: string): Promise<ReceivedEmail> {
  const parsed = await simpleParser(source);
  // A From with several addresses has no single sender to vouch for.
  const fromValues = parsed.from?.value ?? [];
  const from = fromValues.length === 1 ? (fromValues[0].address?.toLowerCase() ?? '') : '';

  const attachments: EmailAttachment[] = [];
  let total = 0;
  for (const a of parsed.attachments) {
    if (a.contentDisposition !== 'attachment' && a.contentType !== 'application/pdf') continue;
    total += a.content.length;
    if (total > MAX_ATTACHMENT_BYTES) throw new Error('Attachments are larger than 12 MB');
    if (attachments.length >= MAX_ATTACHMENTS) throw new Error(`More than ${MAX_ATTACHMENTS} attachments`);
    // Only PDFs pass the processor, so name them as PDFs: nodemailer derives the
    // content type from the extension.
    attachments.push({ filename: `${safeFilename(a.filename ?? '').replace(/\.[^.]*$/, '')}.pdf`, content: a.content });
  }

  const authLines = parsed.headerLines
    .filter((h) => h.key === 'authentication-results')
    .map((h) => h.line.replace(/^authentication-results:\s*/i, '').replace(/\r?\n\s+/g, ' '));

  return {
    id,
    from,
    subject: parsed.subject ?? '',
    messageId: parsed.messageId ?? null,
    text: parsed.text ?? '',
    html: typeof parsed.html === 'string' ? parsed.html : null,
    attachments,
    authenticated: isAuthenticated(authLines, from),
  };
}

type MockEmail = {
  from: string;
  subject: string;
  message_id?: string;
  text?: string;
  html?: string;
  authenticated?: boolean;
  attachments?: Array<{ filename: string; content_base64: string }>;
};

/**
 * Load the email a stored WebhookEvent points at. The payload carries
 * `data.imap = { uidValidity, uid }`, so a retry or an admin's pick re-reads the
 * message from the mailbox. Without IMAP credentials (dev, CI) the email is
 * read from `data.mock_email` instead, so the whole flow is testable offline;
 * production never takes that branch.
 */
export async function loadReceivedEmail(payload: Record<string, unknown>): Promise<ReceivedEmail> {
  const data = (payload.data ?? {}) as Record<string, unknown>;
  const id = String(data.email_id ?? '');
  if (!id) throw new Error('Event has no email_id');

  if (!inboxConfigured()) {
    const mock = data.mock_email as MockEmail | undefined;
    if (process.env.NODE_ENV === 'production' || !mock) {
      throw new Error('IMAP is not configured');
    }
    return {
      id,
      from: mock.from.toLowerCase(),
      subject: mock.subject,
      messageId: mock.message_id ?? null,
      text: mock.text ?? '',
      html: mock.html ?? null,
      authenticated: mock.authenticated ?? true,
      attachments: (mock.attachments ?? []).map((a) => ({
        filename: safeFilename(a.filename),
        content: Buffer.from(a.content_base64, 'base64'),
      })),
    };
  }

  const ref = data.imap as ImapRef | undefined;
  if (!ref?.uidValidity || !Number.isInteger(ref.uid)) throw new Error('Event has no IMAP reference');

  const client = openInbox();
  await client.connect();
  try {
    const lock = await client.getMailboxLock('INBOX', { readOnly: true });
    try {
      // UIDs are only stable while UIDVALIDITY is unchanged.
      if (String(client.mailbox && client.mailbox.uidValidity) !== ref.uidValidity) {
        throw new MessageGoneError('The mailbox was reset (UIDVALIDITY changed); the message cannot be re-read');
      }
      const msg = await client.fetchOne(String(ref.uid), { source: true, size: true }, { uid: true });
      if (!msg || !msg.source) throw new MessageGoneError('The message is no longer in the mailbox');
      if ((msg.size ?? 0) > MAX_MESSAGE_BYTES) throw new MessageGoneError('The message is larger than 15 MB');
      return await parseRawEmail(msg.source, id);
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => undefined);
  }
}
