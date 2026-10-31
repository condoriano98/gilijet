import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createHash } from 'crypto';
import { prisma } from '@/shared/server/db';
import { hashPassword, setCustomerSession } from '@/shared/server/auth';
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

export const metadata = { title: 'Reset password' };

async function resetPasswordAction(formData: FormData) {
  'use server';
  const rawToken = String(formData.get('token') ?? '');
  const newPassword = String(formData.get('password') ?? '');
  const confirmPassword = String(formData.get('confirmPassword') ?? '');

  if (!rawToken) redirect('/account/forgot-password');

  if (newPassword.length < 8 || newPassword !== confirmPassword) {
    redirect(
      `/account/reset-password?error=invalid&token=${encodeURIComponent(rawToken)}`,
    );
  }

  const tokenHash = createHash('sha256').update(rawToken).digest('hex');
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
  });

  if (!record || record.usedAt || record.expiresAt < new Date()) {
    redirect('/account/reset-password?error=expired');
  }

  const [customer] = await Promise.all([
    prisma.customer.update({
      where: { email: record.email },
      data: { passwordHash: await hashPassword(newPassword) },
    }),
    prisma.passwordResetToken.update({
      where: { tokenHash },
      data: { usedAt: new Date() },
    }),
  ]);

  await setCustomerSession({
    sub: customer.id,
    role: 'customer',
    email: customer.email,
    fullName: customer.fullName,
  });

  redirect('/account?ok=password_changed');
}

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await searchParams;

  if (!token && error !== 'expired') {
    redirect('/account/forgot-password');
  }

  if (error === 'expired') {
    return (
      <AuthLayout
        title="Link expired"
        description="This reset link has already been used or has expired."
      >
        <Button asChild className={AUTH_PRIMARY}>
          <Link href="/account/forgot-password">Request a new link</Link>
        </Button>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Set a new password"
      description="Choose a strong password with at least 8 characters."
    >
      <form action={resetPasswordAction} className="space-y-5">
        <input type="hidden" name="token" value={token ?? ''} />

        {error === 'invalid' && (
          <p role="alert" className={AUTH_ALERT_ERROR}>
            Passwords must match and be at least 8 characters.
          </p>
        )}

        <div className="space-y-2">
          <Label htmlFor="password" className={AUTH_LABEL}>
            New password
          </Label>
          <Input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className={AUTH_INPUT}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirmPassword" className={AUTH_LABEL}>
            Confirm password
          </Label>
          <Input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className={AUTH_INPUT}
          />
        </div>

        <Button type="submit" size="lg" className={AUTH_PRIMARY}>
          Set new password
        </Button>
      </form>
    </AuthLayout>
  );
}
