import Link from 'next/link';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { prisma } from '@/shared/server/db';
import { hashPassword, setCustomerSession, getCustomerSession } from '@/shared/server/auth';
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

export const metadata = { title: 'Create account' };

const registerSchema = z.object({
  fullName: z.string().min(2).max(120),
  email: z.string().email(),
  phoneNumber: z.string().min(6).max(40).optional().or(z.literal('')),
  password: z.string().min(8).max(100),
  agreedToTerms: z.string().nullish(),
});

async function registerAction(formData: FormData) {
  'use server';
  const parsed = registerSchema.safeParse({
    fullName: formData.get('fullName'),
    email: formData.get('email'),
    phoneNumber: formData.get('phoneNumber'),
    password: formData.get('password'),
    agreedToTerms: formData.get('agreedToTerms'),
  });
  if (!parsed.success) {
    redirect(`/account/register?error=invalid`);
  }
  if (!parsed.data.agreedToTerms) {
    redirect(`/account/register?error=terms`);
  }

  const email = parsed.data.email.toLowerCase();
  const existing = await prisma.customer.findUnique({ where: { email } });
  if (existing) {
    redirect(`/account/register?error=exists`);
  }

  const passwordHash = await hashPassword(parsed.data.password);
  const customer = await prisma.customer.create({
    data: {
      email,
      passwordHash,
      fullName: parsed.data.fullName.trim(),
      phoneNumber: parsed.data.phoneNumber || null,
    },
  });

  await setCustomerSession({
    sub: customer.id,
    role: 'customer',
    email: customer.email,
    fullName: customer.fullName,
  });

  redirect(safeNext(formData.get('next') as string | null, '/account'));
}

export default async function CustomerRegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const session = await getCustomerSession();
  if (session) redirect('/account');
  const { error, next } = await searchParams;

  return (
    <AuthLayout
      title="Create your Gilifast account"
      description="Save passenger details, see past trips, and skip the form on future bookings."
    >
      <form action={registerAction} className="space-y-5">
        <input type="hidden" name="next" value={next ?? ''} />

        {error === 'exists' && (
          <p role="alert" className={AUTH_ALERT_WARN}>
            An account with that email already exists.{' '}
            <Link
              href={`/account/login${next ? `?next=${encodeURIComponent(next)}` : ''}`}
              className="underline"
            >
              Sign in instead
            </Link>
            .
          </p>
        )}
        {error === 'terms' && (
          <p role="alert" className={AUTH_ALERT_ERROR}>
            Please accept the Terms and Privacy Policy.
          </p>
        )}
        {error === 'invalid' && (
          <p role="alert" className={AUTH_ALERT_ERROR}>
            Please fill in all required fields with valid values.
          </p>
        )}

        <GoogleSignInButton next={next || undefined} label="Sign up with Google" />

        <div className="space-y-2">
          <Label htmlFor="fullName" className={AUTH_LABEL}>
            Full name
          </Label>
          <Input
            id="fullName"
            name="fullName"
            required
            minLength={2}
            autoComplete="name"
            className={AUTH_INPUT}
          />
        </div>
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
          <Label htmlFor="phoneNumber" className={AUTH_LABEL}>
            Phone (WhatsApp)
          </Label>
          <Input
            id="phoneNumber"
            name="phoneNumber"
            type="tel"
            placeholder="+62 812 3456 7890"
            autoComplete="tel"
            className={AUTH_INPUT}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password" className={AUTH_LABEL}>
            Password
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
          <p className="text-[13px] text-brand-muted">At least 8 characters.</p>
        </div>

        <label className="flex min-h-11 items-start gap-3 rounded-2xl bg-brand-surface px-4 py-3 text-sm text-brand-text">
          <input
            type="checkbox"
            name="agreedToTerms"
            value="1"
            required
            className="mt-0.5 h-5 w-5 shrink-0 accent-brand"
          />
          <span>
            I agree to the{' '}
            <Link href="/terms" className={AUTH_LINK}>
              Terms of Service
            </Link>{' '}
            and{' '}
            <Link href="/privacy" className={AUTH_LINK}>
              Privacy Policy
            </Link>
            .
          </span>
        </label>

        <Button type="submit" size="lg" className={AUTH_PRIMARY}>
          Create account
        </Button>

        <div className="text-center text-sm text-brand-muted">
          Already have an account?{' '}
          <Link
            href={`/account/login${next ? `?next=${encodeURIComponent(next)}` : ''}`}
            className={AUTH_LINK}
          >
            Sign in
          </Link>
        </div>
      </form>
    </AuthLayout>
  );
}
