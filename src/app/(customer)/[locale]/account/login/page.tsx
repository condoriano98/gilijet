import Link from 'next/link';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { prisma } from '@/shared/server/db';
import { verifyPassword, setCustomerSession, getCustomerSession } from '@/shared/server/auth';
import { loginGate, recordLoginAttempt } from '@/shared/server/login-throttle';
import { safeNext } from '@/shared/lib/safe-next';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
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
import { GoogleSignInButton } from '@/app/(customer)/[locale]/account/_components/google-signin-button';

export const metadata = { title: 'Sign in' };

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

async function loginAction(formData: FormData) {
  'use server';
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) {
    redirect(`/account/login?error=invalid`);
  }

  const email = parsed.data.email.toLowerCase();
  const gate = await loginGate('CUSTOMER', email);
  if (!gate.allowed) {
    redirect(`/account/login?error=locked`);
  }

  const customer = await prisma.customer.findUnique({
    where: { email },
  });
  if (!customer || !customer.passwordHash) {
    // No passwordHash means a Google-only account. Don't reveal which case
    // it is; surface the same generic credentials error.
    await recordLoginAttempt('CUSTOMER', email, false);
    redirect(`/account/login?error=credentials`);
  }
  const ok = await verifyPassword(parsed.data.password, customer.passwordHash);
  if (!ok) {
    await recordLoginAttempt('CUSTOMER', email, false);
    redirect(`/account/login?error=credentials`);
  }

  await recordLoginAttempt('CUSTOMER', email, true);
  await setCustomerSession({
    sub: customer.id,
    role: 'customer',
    email: customer.email,
    fullName: customer.fullName,
  });

  redirect(safeNext(formData.get('next') as string | null, '/account'));
}

export default async function CustomerLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const session = await getCustomerSession();
  if (session) redirect('/account');
  const { error, next } = await searchParams;

  return (
    <AuthLayout
      title="Sign in to Gilifast"
      description="Manage bookings, see ticket history, and check in faster."
    >
      <form action={loginAction} className="space-y-5">
        <input type="hidden" name="next" value={next ?? ''} />

        {error === 'credentials' && (
          <p role="alert" className={AUTH_ALERT_ERROR}>
            Wrong email or password.
          </p>
        )}
        {error === 'invalid' && (
          <p role="alert" className={AUTH_ALERT_ERROR}>
            Check your email and password.
          </p>
        )}
        {error === 'locked' && (
          <p role="alert" className={AUTH_ALERT_ERROR}>
            Too many failed attempts. Please wait 15 minutes before trying again.
          </p>
        )}
        {error === 'google_unavailable' && (
          <p role="alert" className={AUTH_ALERT_WARN}>
            Google sign-in is currently unavailable. Use email and password instead.
          </p>
        )}
        {error === 'google_cancelled' && (
          <p role="alert" className={AUTH_ALERT_INFO}>
            Google sign-in was cancelled.
          </p>
        )}
        {error === 'google_state' && (
          <p role="alert" className={AUTH_ALERT_ERROR}>
            Google sign-in could not be verified. Please try again.
          </p>
        )}
        {error === 'google_exchange' && (
          <p role="alert" className={AUTH_ALERT_ERROR}>
            We couldn&apos;t complete sign-in with Google. Please try again.
          </p>
        )}
        {error === 'google_unverified' && (
          <p role="alert" className={AUTH_ALERT_ERROR}>
            Your Google email isn&apos;t verified. Please verify it in Google and try again.
          </p>
        )}

        <GoogleSignInButton next={next || undefined} />

        <div className="space-y-2">
          <Label htmlFor="email" className={AUTH_LABEL}>
            Email
          </Label>
          <Input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className={AUTH_INPUT}
          />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="password" className={AUTH_LABEL}>
              Password
            </Label>
            <Link
              href="/account/forgot-password"
              className="inline-flex min-h-11 items-center text-[13px] font-semibold text-brand hover:underline"
            >
              Forgot password?
            </Link>
          </div>
          <Input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="current-password"
            className={AUTH_INPUT}
          />
        </div>

        <Button type="submit" size="lg" className={AUTH_PRIMARY}>
          Sign in
        </Button>

        <div className="space-y-1 text-center text-sm text-brand-muted">
          <div>
            New to Gilifast?{' '}
            <Link
              href={`/account/register${next ? `?next=${encodeURIComponent(next)}` : ''}`}
              className={AUTH_LINK}
            >
              Create an account
            </Link>
          </div>
          <div>
            Just need a ticket?{' '}
            <Link href="/b" className={AUTH_LINK}>
              Look up your booking
            </Link>
          </div>
        </div>
      </form>
    </AuthLayout>
  );
}
