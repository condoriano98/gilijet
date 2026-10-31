import { customerBookingStatusLabel } from '@/features/booking/status-label';
import Link from 'next/link';
import Image from 'next/image';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import type { BookingStatus, TripType } from '@prisma/client';
import { prisma } from '@/shared/server/db';
import {
  requireCustomer,
  clearCustomerSession,
  hashPassword,
  verifyPassword,
} from '@/shared/server/auth';
import { formatLocalDate, formatLocalTime } from '@/shared/lib/datetime';
import { formatIDR } from '@/shared/lib/utils';
import { getMainLeg } from '@/features/booking/helpers';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { REVIEW_OPENS_AFTER_DEPARTURE_MS } from '@/features/booking/constants';
import { CUSTOMER_LOGIN_PATH } from '@/shared/constants/routes';

export const metadata = { title: 'My account' };

async function logoutAction() {
  'use server';
  await clearCustomerSession();
  redirect('/');
}

const profileSchema = z.object({
  fullName: z.string().min(2).max(120),
  phoneNumber: z.string().max(40).optional().or(z.literal('')),
  nationality: z.string().max(80).optional().or(z.literal('')),
});

async function updateProfileAction(formData: FormData) {
  'use server';
  const session = await requireCustomer();
  const parsed = profileSchema.safeParse({
    fullName: formData.get('fullName'),
    phoneNumber: formData.get('phoneNumber'),
    nationality: formData.get('nationality'),
  });
  if (!parsed.success) {
    redirect(`/account?error=${encodeURIComponent(parsed.error.issues[0].message)}`);
  }
  await prisma.customer.update({
    where: { id: session.sub },
    data: {
      fullName: parsed.data.fullName.trim(),
      phoneNumber: parsed.data.phoneNumber?.trim() || null,
      nationality: parsed.data.nationality?.trim() || null,
    },
  });
  redirect('/account?ok=profile_updated');
}

const passwordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(120),
});

async function changePasswordAction(formData: FormData) {
  'use server';
  const session = await requireCustomer();
  const parsed = passwordSchema.safeParse({
    currentPassword: formData.get('currentPassword'),
    newPassword: formData.get('newPassword'),
  });
  if (!parsed.success) {
    redirect('/account?error=password_invalid');
  }
  const customer = await prisma.customer.findUnique({
    where: { id: session.sub },
  });
  if (!customer) redirect(CUSTOMER_LOGIN_PATH);
  // Google-only accounts have no passwordHash yet. Send them to
  // forgot-password to mint one via the verified email flow.
  if (!customer.passwordHash) redirect('/account?error=no_password_set');
  const ok = await verifyPassword(parsed.data.currentPassword, customer.passwordHash);
  if (!ok) redirect('/account?error=wrong_password');
  const newHash = await hashPassword(parsed.data.newPassword);
  await prisma.customer.update({
    where: { id: session.sub },
    data: { passwordHash: newHash },
  });
  redirect('/account?ok=password_changed');
}

function statusVariant(status: string) {
  switch (status) {
    case 'CONFIRMED':
      return 'success' as const;
    case 'PENDING_PAYMENT':
      return 'warning' as const;
    case 'EXPIRED':
    case 'CANCELLED_BY_CUSTOMER':
    case 'CANCELLED_BY_OPERATOR':
      return 'destructive' as const;
    default:
      return 'outline' as const;
  }
}

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const { error, ok } = await searchParams;
  const session = await requireCustomer();

  const customer = await prisma.customer.findUnique({
    where: { id: session.sub },
  });
  if (!customer) {
    await clearCustomerSession();
    redirect(CUSTOMER_LOGIN_PATH);
  }

  // Pull bookings linked by customerId OR matching the customer's email
  // (covers bookings made before the user registered).
  const bookings = await prisma.booking.findMany({
    where: {
      OR: [
        { customerId: session.sub },
        { customerEmail: session.email },
      ],
    },
    include: {
      leg: { include: { schedule: { include: { boat: true } } } },
      outboundLeg: { include: { schedule: { include: { boat: true } } } },
      returnLeg: { include: { schedule: { include: { boat: true } } } },
      review: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  const now = Date.now();
  const upcoming = bookings.filter((b) => {
    const mainLeg = getMainLeg(b);
    return b.status === 'CONFIRMED' && mainLeg && mainLeg.departureDate.getTime() > now;
  });
  const past = bookings.filter((b) => !upcoming.includes(b));

  const initials = customer.fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <div className="mx-auto max-w-[1180px] px-5 pb-4 pt-6 sm:px-6">
      {/* Profile header */}
      <section className="relative overflow-hidden rounded-[32px] bg-brand-dark px-6 py-8 text-white sm:px-12 sm:py-10">
        <Image
          src="/brand/hero-home.png"
          alt=""
          fill
          sizes="100vw"
          className="object-cover object-[center_60%] opacity-35"
        />
        <div className="relative flex flex-wrap items-center justify-between gap-5">
          <div className="flex min-w-0 items-center gap-4 sm:gap-5">
            <div
              aria-hidden
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand-periwinkle text-xl font-extrabold text-brand-dark sm:h-[68px] sm:w-[68px] sm:text-[26px]"
            >
              {initials}
            </div>
            <div className="min-w-0">
              <h1 className="font-display text-3xl font-extrabold tracking-tight sm:text-[34px]">
                Hi, {customer.fullName.split(' ')[0]}
              </h1>
              <p className="mt-1 break-all text-[15px] text-brand-periwinkle">{customer.email}</p>
            </div>
          </div>
          <form action={logoutAction}>
            <Button
              type="submit"
              variant="outline"
              size="sm"
              className="h-11 rounded-full border-[1.5px] border-white bg-transparent px-6 font-bold text-white hover:bg-white/10 hover:text-white"
            >
              Sign out
            </Button>
          </form>
        </div>
      </section>

      {ok ? (
        <p role="status" className="mt-5 rounded-[14px] bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
          {ok.replace(/_/g, ' ')} ✓
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-5 rounded-[14px] bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error.replace(/_/g, ' ')}
        </p>
      ) : null}

      {/* Quick stats */}
      <section aria-label="Quick stats" className="mt-5 grid gap-4 sm:grid-cols-3">
        <div className="rounded-[22px] border border-brand-line bg-white p-5 sm:px-6 sm:py-[22px]">
          <div className="text-sm font-semibold text-brand-muted">Upcoming trips</div>
          <div className="mt-1.5 font-display text-4xl font-extrabold tracking-tight text-brand sm:text-[40px]">
            {upcoming.length}
          </div>
        </div>
        <div className="rounded-[22px] border border-brand-line bg-white p-5 sm:px-6 sm:py-[22px]">
          <div className="text-sm font-semibold text-brand-muted">Total bookings</div>
          <div className="mt-1.5 font-display text-4xl font-extrabold tracking-tight text-brand-ink sm:text-[40px]">
            {bookings.length}
          </div>
        </div>
        <div className="flex flex-col justify-between gap-3.5 rounded-[22px] bg-brand p-5 text-white sm:px-6 sm:py-[22px]">
          <div className="text-sm font-semibold text-brand-periwinkle">Quick action</div>
          <Button asChild className="h-12 rounded-[14px] bg-white font-bold text-brand-dark hover:bg-brand-periwinkle">
            <Link href="/">Book a new trip</Link>
          </Button>
        </div>
      </section>

      {/* Upcoming */}
      <h2 className="mt-11 font-display text-2xl font-extrabold tracking-tight text-brand-ink">
        Upcoming trips
      </h2>
      {upcoming.length === 0 ? (
        <div className="mt-4 rounded-[22px] border border-brand-line bg-white px-6 py-10 text-center text-sm text-brand-muted">
          No upcoming trips.{' '}
          <Link href="/" className="inline-flex min-h-11 items-center font-semibold text-brand hover:underline">
            Find a boat →
          </Link>
        </div>
      ) : (
        <div className="mt-4 space-y-3.5">
          {upcoming.map((b) => (
            <BookingCard key={b.id} booking={b} />
          ))}
        </div>
      )}

      {/* History */}
      {past.length > 0 && (
        <>
          <h2 className="mt-11 font-display text-2xl font-extrabold tracking-tight text-brand-ink">
            Booking history
          </h2>
          <div className="mt-4 space-y-3.5">
            {past.map((b) => {
              const mainLeg = getMainLeg(b);
              const canReview = Boolean(
                b.status === 'CONFIRMED' &&
                !b.review &&
                mainLeg &&
                mainLeg.departureDate.getTime() < now - REVIEW_OPENS_AFTER_DEPARTURE_MS,
              );
              return (
                <BookingCard
                  key={b.id}
                  booking={b}
                  canReview={canReview}
                  hasReview={!!b.review}
                  muted
                />
              );
            })}
          </div>
        </>
      )}

      {/* Profile editing */}
      <h2 className="mt-11 font-display text-2xl font-extrabold tracking-tight text-brand-ink">
        Profile
      </h2>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="rounded-3xl border border-brand-line bg-white p-6 sm:p-7">
          <h3 className="text-lg font-bold text-brand-ink">Personal details</h3>
          <p className="mt-1 text-sm text-brand-muted">Used to prefill new bookings.</p>
          <form action={updateProfileAction} className="mt-5 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="fullName">Full name</Label>
              <Input
                id="fullName"
                name="fullName"
                defaultValue={customer.fullName}
                required
                minLength={2}
                className="h-12 rounded-2xl border-brand-line text-base"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phoneNumber">Phone (WhatsApp preferred)</Label>
              <Input
                id="phoneNumber"
                name="phoneNumber"
                type="tel"
                defaultValue={customer.phoneNumber ?? ''}
                className="h-12 rounded-2xl border-brand-line text-base"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nationality">Nationality</Label>
              <Input
                id="nationality"
                name="nationality"
                defaultValue={customer.nationality ?? ''}
                className="h-12 rounded-2xl border-brand-line text-base"
              />
            </div>
            <Button type="submit" size="sm" className="h-12 rounded-[14px] bg-brand px-6 font-bold text-white hover:bg-brand-dark">
              Save changes
            </Button>
          </form>
        </div>

        <div className="rounded-3xl border border-brand-line bg-white p-6 sm:p-7">
          <h3 className="text-lg font-bold text-brand-ink">Change password</h3>
          <p className="mt-1 text-sm text-brand-muted">
            You&apos;ll stay signed in on this device.
          </p>
          {customer.passwordHash ? (
            <form action={changePasswordAction} className="mt-5 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="currentPassword">Current password</Label>
                <Input
                  id="currentPassword"
                  name="currentPassword"
                  type="password"
                  required
                  autoComplete="current-password"
                  className="h-12 rounded-2xl border-brand-line text-base"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="newPassword">New password</Label>
                <Input
                  id="newPassword"
                  name="newPassword"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  className="h-12 rounded-2xl border-brand-line text-base"
                />
              </div>
              <Button
                type="submit"
                size="sm"
                variant="outline"
                className="h-12 rounded-[14px] border-[1.5px] border-brand px-6 font-bold text-brand hover:bg-brand-periwinkle"
              >
                Update password
              </Button>
            </form>
          ) : (
            <p className="mt-5 text-sm leading-relaxed text-brand-text">
              Your account uses Google sign-in. To set a password,{' '}
              <Link href="/account/forgot-password" className="font-semibold text-brand underline underline-offset-2">
                use the forgot-password flow
              </Link>
              .
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

type BookingWithLeg = {
  id: string;
  bookingReference: string;
  status: BookingStatus;
  totalAmount: unknown;
  leg?: {
    departureDate: Date;
    schedule: {
      originPort: string;
      destinationPort: string;
      boat: { name: string };
    };
  } | null;
  outboundLeg?: {
    departureDate: Date;
    schedule: {
      originPort: string;
      destinationPort: string;
      boat: { name: string };
    };
  } | null;
  returnLeg?: {
    departureDate: Date;
    schedule: {
      originPort: string;
      destinationPort: string;
      boat: { name: string };
    };
  } | null;
  tripType: TripType;
};

function BookingCard({
  booking,
  muted,
  canReview,
  hasReview,
}: {
  booking: BookingWithLeg;
  muted?: boolean;
  canReview?: boolean;
  hasReview?: boolean;
}) {
  const mainLeg = getMainLeg(booking)!;
  return (
    <article
      className={`flex flex-wrap items-center justify-between gap-5 rounded-[22px] border px-5 py-5 sm:px-6 ${
        muted
          ? 'border-brand-line bg-slate-50'
          : 'border-brand-line bg-white shadow-ambient-sm'
      }`}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="text-[17px] font-bold text-brand-ink sm:text-lg">
            {mainLeg.schedule.originPort} →{' '}
            {mainLeg.schedule.destinationPort}
          </span>
          <Badge variant={statusVariant(booking.status)} className="text-xs">
            {customerBookingStatusLabel(booking.status)}
          </Badge>
          {hasReview ? (
            <Badge variant="outline" className="text-xs">
              Reviewed
            </Badge>
          ) : null}
        </div>
        <div className="mt-1 text-sm text-brand-muted">
          {formatLocalDate(mainLeg.departureDate, 'EEE, dd MMM yyyy')}{' '}
          ·{' '}
          <span className="font-mono">
            {formatLocalTime(mainLeg.departureDate)}
          </span>{' '}
          WITA · {mainLeg.schedule.boat.name}
        </div>
        <div className="mt-0.5 break-all font-mono text-xs text-brand-muted">
          {booking.bookingReference}
        </div>
        {canReview ? (
          <Link
            href={`/reviews/new?bookingId=${booking.id}`}
            className="mt-1 inline-flex min-h-11 items-center text-sm font-semibold text-amber-700 hover:underline"
          >
            ★ Rate your trip →
          </Link>
        ) : null}
      </div>
      <div className="flex items-center gap-5">
        <div className="text-xl font-extrabold text-brand">
          {formatIDR(Number(booking.totalAmount))}
        </div>
        <Button asChild size="sm" variant="outline" className="h-11 rounded-[14px] border-[1.5px] border-brand px-5 font-bold text-brand hover:bg-brand-periwinkle">
          <Link href={`/b/${booking.bookingReference}`}>View</Link>
        </Button>
      </div>
    </article>
  );
}
