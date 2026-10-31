import Link from 'next/link';
import { redirect } from 'next/navigation';
import { randomBytes, createHash } from 'crypto';
import { prisma } from '@/shared/server/db';
import { env } from '@/shared/server/env';
import { sendPasswordResetEmail } from '@/features/messaging/email';
import {
  AuthLayout,
  AUTH_INPUT,
  AUTH_LABEL,
  AUTH_PRIMARY,
  AUTH_SECONDARY,
  AUTH_LINK,
  AUTH_ALERT_ERROR,
  AUTH_ALERT_WARN,
  AUTH_ALERT_INFO,
  AUTH_ALERT_OK,
} from '@/app/(customer)/_components/auth-layout';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { MS_PER_HOUR } from '@/shared/constants/time';

export const metadata = { title: 'Forgot password' };

async function requestResetAction(formData: FormData) {
  'use server';
  const email = String(formData.get('email') ?? '')
    .toLowerCase()
    .trim();
  if (!email) redirect('/account/forgot-password?error=invalid');

  const customer = await prisma.customer.findUnique({ where: { email } });
  if (customer) {
    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + MS_PER_HOUR); // 1 hour

    await prisma.passwordResetToken.create({
      data: { email, tokenHash, expiresAt },
    });

    const resetUrl = `${env.APP_BASE_URL}/account/reset-password?token=${rawToken}`;
    await sendPasswordResetEmail({ to: email, resetUrl });
  }

  // Always show success to prevent email enumeration
  redirect('/account/forgot-password?ok=sent');
}

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { ok, error } = await searchParams;

  return (
    <AuthLayout
      title="Forgot your password?"
      description="Enter your email and we'll send you a reset link."
    >
      {ok === 'sent' ? (
        <div className="space-y-5">
          <div className={AUTH_ALERT_OK}>
            If an account exists for that email, you&apos;ll receive a
            reset link shortly. Check your inbox (and spam folder).
          </div>
          <Button asChild variant="outline" className={AUTH_SECONDARY}>
            <Link href="/account/login">Back to sign in</Link>
          </Button>
        </div>
      ) : (
        <form action={requestResetAction} className="space-y-5">
          {error === 'invalid' && (
            <p role="alert" className={AUTH_ALERT_ERROR}>
              Please enter a valid email address.
            </p>
          )}
          <div className="space-y-2">
            <Label htmlFor="email" className={AUTH_LABEL}>
              Email address
            </Label>
            <Input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              className={AUTH_INPUT}
            />
          </div>
          <Button type="submit" size="lg" className={AUTH_PRIMARY}>
            Send reset link
          </Button>
          <div className="text-center text-sm text-brand-muted">
            Remember it?{' '}
            <Link href="/account/login" className={AUTH_LINK}>
              Sign in
            </Link>
          </div>
        </form>
      )}
    </AuthLayout>
  );
}
