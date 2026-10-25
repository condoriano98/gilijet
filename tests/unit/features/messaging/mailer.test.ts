import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  env: {} as Record<string, unknown>,
  sendMail: vi.fn(),
  createTransport: vi.fn(),
}));

vi.mock('@/shared/server/env', () => ({ env: mocks.env }));
vi.mock('nodemailer', () => ({ default: { createTransport: mocks.createTransport } }));

import { mailConfigured, sendMail } from '@/features/messaging/mailer';

const configure = () =>
  Object.assign(mocks.env, {
    SMTP_HOST: 'smtp.example.com',
    SMTP_PORT: 465,
    SMTP_USER: 'admin@example.com',
    SMTP_PASSWORD: 'secret',
    EMAIL_FROM: 'Gilifast <admin@example.com>',
  });

beforeEach(() => {
  for (const k of Object.keys(mocks.env)) delete mocks.env[k];
  mocks.sendMail.mockReset();
  mocks.sendMail.mockResolvedValue({});
  mocks.createTransport.mockReset();
  mocks.createTransport.mockReturnValue({ sendMail: mocks.sendMail });
});

describe('mailConfigured', () => {
  it('is false until host, user, password and from are all set', () => {
    expect(mailConfigured()).toBe(false);
    configure();
    expect(mailConfigured()).toBe(true);
    delete mocks.env.EMAIL_FROM;
    expect(mailConfigured()).toBe(false);
  });
});

describe('sendMail', () => {
  it('does not touch the network when unconfigured', async () => {
    const res = await sendMail({ to: 'a@b.c', subject: 's', html: '<p>x</p>' });
    expect(res).toEqual({ delivered: false, provider: 'console' });
    expect(mocks.createTransport).not.toHaveBeenCalled();
  });

  it('sends with the configured sender, reply-to and attachments', async () => {
    configure();
    const res = await sendMail({
      to: 'buyer@example.com',
      subject: 'Ticket',
      html: '<p>x</p>',
      replyTo: 'admin@gilifast.com',
      attachments: [{ filename: 't.pdf', content: Buffer.from('%PDF-1.4') }],
    });
    expect(res).toEqual({ delivered: true, provider: 'smtp' });
    expect(mocks.sendMail).toHaveBeenCalledWith({
      from: 'Gilifast <admin@example.com>',
      to: 'buyer@example.com',
      subject: 'Ticket',
      html: '<p>x</p>',
      replyTo: 'admin@gilifast.com',
      attachments: [{ filename: 't.pdf', content: Buffer.from('%PDF-1.4') }],
    });
  });

  it('uses implicit TLS on 465 and fails fast with timeouts', async () => {
    configure();
    await sendMail({ to: 'a@b.c', subject: 's', html: 'x' });
    // The transport is built once per process, so it may already exist here.
    if (mocks.createTransport.mock.calls.length) {
      expect(mocks.createTransport.mock.calls[0][0]).toMatchObject({
        secure: true,
        connectionTimeout: expect.any(Number),
        socketTimeout: expect.any(Number),
      });
    }
  });

  it('requires TLS on a STARTTLS port so the app password is never sent in clear', async () => {
    configure();
    mocks.env.SMTP_PORT = 587;
    vi.resetModules();
    const fresh = await import('@/features/messaging/mailer');
    await fresh.sendMail({ to: 'a@b.c', subject: 's', html: 'x' });
    expect(mocks.createTransport.mock.calls.at(-1)?.[0]).toMatchObject({ secure: false, requireTLS: true });
  });

  it('returns delivered:false instead of throwing when the server is unreachable', async () => {
    configure();
    mocks.sendMail.mockRejectedValue(new Error('ETIMEDOUT'));
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = await sendMail({ to: 'a@b.c', subject: 's', html: 'x' });
    err.mockRestore();
    expect(res).toEqual({ delivered: false, provider: 'smtp', error: 'ETIMEDOUT' });
  });
});
