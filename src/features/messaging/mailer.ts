import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '@/shared/server/env';

/**
 * Outbound mail transport: SMTP (Gmail app password). Every send in `email.ts`
 * goes through `sendMail`, which never throws: a refused or unreachable server
 * comes back as `delivered: false`, the same as an unconfigured one.
 */

export type MailAttachment = { filename: string; content: Buffer };
export type MailResult = { delivered: boolean; provider: 'smtp' | 'console'; error?: string };

export function mailConfigured(): boolean {
  return Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASSWORD && env.EMAIL_FROM);
}

let transport: Transporter | null = null;

function getTransport(): Transporter {
  transport ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    // 465 is implicit TLS; anything else (587) upgrades with STARTTLS.
    secure: env.SMTP_PORT === 465,
    // On 587 the connection starts in clear text: never fall back to it, or a
    // man in the middle could strip STARTTLS and read the app password.
    requireTLS: env.SMTP_PORT !== 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
    // A serverless function has a hard time limit: fail fast instead of hanging.
    connectionTimeout: 8_000,
    greetingTimeout: 8_000,
    socketTimeout: 15_000,
  });
  return transport;
}

export async function sendMail(args: {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
  attachments?: MailAttachment[];
}): Promise<MailResult> {
  if (!mailConfigured()) return { delivered: false, provider: 'console' };
  try {
    await getTransport().sendMail({
      from: env.EMAIL_FROM,
      to: args.to,
      subject: args.subject,
      html: args.html,
      ...(args.replyTo ? { replyTo: args.replyTo } : {}),
      ...(args.attachments?.length
        ? { attachments: args.attachments.map((a) => ({ filename: a.filename, content: a.content })) }
        : {}),
    });
    return { delivered: true, provider: 'smtp' };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error(`[email] SMTP send to ${args.to} failed:`, reason);
    return { delivered: false, provider: 'smtp', error: reason.slice(0, 200) };
  }
}
