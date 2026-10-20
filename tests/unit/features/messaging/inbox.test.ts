import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({ env: {} as Record<string, unknown> }));
vi.mock('@/shared/server/env', () => ({ env: mocks.env }));
vi.mock('imapflow', () => ({ ImapFlow: vi.fn() }));

import { isAuthenticated, loadReceivedEmail, parseRawEmail, safeFilename } from '@/features/messaging/inbox';

const GOOD = 'mx.google.com; dkim=pass header.i=@virendrafastferry.com header.s=s1; spf=pass smtp.mailfrom=virendrafastferry.com; dmarc=pass (p=NONE) header.from=virendrafastferry.com';

describe('isAuthenticated', () => {
  it('passes on DMARC pass from our own server', () => {
    expect(isAuthenticated([GOOD], 'no-reply@virendrafastferry.com')).toBe(true);
  });

  it('passes on DKIM aligned with the From domain when there is no DMARC', () => {
    const h = 'mx.google.com; dkim=pass header.i=@virendrafastferry.com header.d=virendrafastferry.com; spf=pass; dmarc=none';
    expect(isAuthenticated([h], 'no-reply@virendrafastferry.com')).toBe(true);
    expect(isAuthenticated([h.replace('header.d=virendrafastferry.com', 'header.d=mail.virendrafastferry.com')], 'a@virendrafastferry.com')).toBe(false);
    expect(isAuthenticated([h.replace('header.d=virendrafastferry.com', 'header.d=virendrafastferry.com')], 'a@mail.virendrafastferry.com')).toBe(true);
  });

  it('reads the DKIM signing domain from header.i as Gmail writes it (real Wahana mail)', () => {
    const h = 'mx.google.com; dkim=pass header.i=@virendrafastferry.com header.s=resend header.b=fvuM7kkS; dkim=pass header.i=@amazonses.com header.s=zh4g header.b=BpK; spf=pass; dmarc=none';
    expect(isAuthenticated([h], 'no-reply@virendrafastferry.com')).toBe(true);
    expect(isAuthenticated([h], 'no-reply@evil.test')).toBe(false);
  });

  it('DMARC pass counts only for the From domain Gmail names in header.from', () => {
    const h = 'mx.google.com; dkim=pass header.i=@attacker.test; spf=pass; dmarc=pass (p=NONE) header.from=attacker.test';
    expect(isAuthenticated([h], 'no-reply@virendrafastferry.com')).toBe(false);
    expect(isAuthenticated([h], 'x@attacker.test')).toBe(true);
  });

  it('rejects DKIM that passed for somebody else’s domain', () => {
    const h = 'mx.google.com; dkim=pass header.d=evil.test; spf=pass; dmarc=fail';
    expect(isAuthenticated([h], 'no-reply@virendrafastferry.com')).toBe(false);
  });

  it('rejects when there is no header, or it was not written by mx.google.com', () => {
    expect(isAuthenticated([], 'a@b.com')).toBe(false);
    expect(isAuthenticated(['evil.test; dmarc=pass'], 'a@b.com')).toBe(false);
  });

  it('only the topmost header counts: a pasted-in pass lower down does not rescue a failing one', () => {
    expect(isAuthenticated(['mx.google.com; dmarc=fail; spf=fail', GOOD], 'no-reply@virendrafastferry.com')).toBe(false);
  });
});

describe('parseRawEmail', () => {
  const raw = (extra = '') =>
    Buffer.from(
      [
        'Authentication-Results: ' + GOOD,
        'From: Wahana <No-Reply@VirendraFastFerry.com>',
        'To: admin@gilifast.com',
        'Subject: E-Ticket Wahana',
        'Message-ID: <abc@wahana>',
        'MIME-Version: 1.0',
        'Content-Type: multipart/mixed; boundary="b1"',
        '',
        '--b1',
        'Content-Type: text/plain; charset=utf-8',
        '',
        'Hi Andy BK-2026-10-ABC234,',
        '--b1',
        'Content-Type: application/pdf; name="../../ticket.pdf"',
        'Content-Disposition: attachment; filename="../../ticket.pdf"',
        'Content-Transfer-Encoding: base64',
        '',
        Buffer.from('%PDF-1.4 hello').toString('base64'),
        extra,
        '--b1--',
        '',
      ].join('\r\n'),
    );

  it('reads sender, subject, Message-ID, body, PDF and the authentication verdict', async () => {
    const e = await parseRawEmail(raw(), 'ref-1');
    expect(e).toMatchObject({
      id: 'ref-1',
      from: 'no-reply@virendrafastferry.com',
      subject: 'E-Ticket Wahana',
      messageId: '<abc@wahana>',
      authenticated: true,
    });
    expect(e.text).toContain('BK-2026-10-ABC234');
    expect(e.attachments).toHaveLength(1);
    expect(e.attachments[0].filename).toBe('ticket.pdf');
    expect(e.attachments[0].content.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('has no sender, and is never authenticated, when From lists several addresses', async () => {
    const two = raw().toString().replace('From: Wahana <No-Reply@VirendraFastFerry.com>', 'From: a@virendrafastferry.com, b@attacker.test');
    const e = await parseRawEmail(Buffer.from(two), 'r');
    expect(e.from).toBe('');
    expect(e.authenticated).toBe(false);
  });

  it('names every attachment as a PDF and refuses a pile of attachments', async () => {
    const exe = raw().toString().replace('filename="../../ticket.pdf"', 'filename="ticket.exe"').replace('name="../../ticket.pdf"', 'name="ticket.exe"');
    expect((await parseRawEmail(Buffer.from(exe), 'r')).attachments[0].filename).toBe('ticket.pdf');

    const part = (n: number) => ['--b1', 'Content-Type: application/pdf', `Content-Disposition: attachment; filename="t${n}.pdf"`, 'Content-Transfer-Encoding: base64', '', Buffer.from('%PDF-1.4').toString('base64')].join('\r\n');
    const many = raw(Array.from({ length: 6 }, (_, i) => part(i)).join('\r\n'));
    await expect(parseRawEmail(many, 'r')).rejects.toThrow('More than 5 attachments');
  });

  it('is not authenticated without an Authentication-Results header', async () => {
    const e = await parseRawEmail(Buffer.from(raw().toString().replace(/^Authentication-Results:.*\r\n/, '')), 'r');
    expect(e.authenticated).toBe(false);
  });
});

describe('safeFilename', () => {
  it('keeps the basename, drops control characters, bounds the length, has a default', () => {
    expect(safeFilename('a/b\\c.pdf')).toBe('c.pdf');
    expect(safeFilename('x\u0000y.pdf')).toBe('xy.pdf');
    expect(safeFilename('')).toBe('ticket.pdf');
    expect(safeFilename('a'.repeat(300)).length).toBe(120);
  });
});

describe('loadReceivedEmail without IMAP credentials', () => {
  beforeEach(() => {
    for (const k of Object.keys(mocks.env)) delete mocks.env[k];
    vi.stubEnv('NODE_ENV', 'test');
  });

  const payload = (mock: unknown) => ({ data: { email_id: 'e1', mock_email: mock } });

  it('reads data.mock_email outside production', async () => {
    const e = await loadReceivedEmail(
      payload({ from: 'No-Reply@X.com', subject: 's', text: 't', attachments: [{ filename: 'a.pdf', content_base64: Buffer.from('%PDF-').toString('base64') }] }),
    );
    expect(e).toMatchObject({ from: 'no-reply@x.com', authenticated: true });
    expect(e.attachments[0].content.toString()).toBe('%PDF-');
  });

  it('lets a test mark a mock email as unauthenticated', async () => {
    expect((await loadReceivedEmail(payload({ from: 'a@b.c', subject: 's', authenticated: false }))).authenticated).toBe(false);
  });

  it('refuses the mock path in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    await expect(loadReceivedEmail(payload({ from: 'a@b.c', subject: 's' }))).rejects.toThrow('IMAP is not configured');
  });

  it('needs an email id', async () => {
    await expect(loadReceivedEmail({ data: {} })).rejects.toThrow('no email_id');
  });
});
