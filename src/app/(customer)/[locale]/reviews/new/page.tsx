import { redirect } from 'next/navigation';
import Link from 'next/link';
import { z } from 'zod';
import { prisma } from '@/shared/server/db';
import { requireCustomer } from '@/shared/server/auth';
import { formatLocalDate, formatLocalTime } from '@/shared/lib/datetime';
import { getMainLeg } from '@/features/booking/helpers';
import { Button } from '@/shared/ui/button';
import { Textarea } from '@/shared/ui/textarea';
import { Label } from '@/shared/ui/label';
import { StarRating } from '@/app/(customer)/[locale]/reviews/new/_components/star-rating';
import { REVIEW_OPENS_AFTER_DEPARTURE_MS } from '@/features/booking/constants';

export const metadata = { title: 'Rate your trip' };

const reviewSchema = z.object({
  bookingId: z.string().min(1),
  rating: z.coerce.number().int().min(1).max(5),
  text: z.string().max(2000).optional().or(z.literal('')),
});

async function submitReviewAction(formData: FormData) {
  'use server';
  const session = await requireCustomer();

  const parsed = reviewSchema.safeParse({
    bookingId: formData.get('bookingId'),
    rating: formData.get('rating'),
    text: formData.get('text'),
  });
  if (!parsed.success) {
    redirect(
      `/reviews/new?bookingId=${formData.get('bookingId')}&error=${encodeURIComponent(
        parsed.error.issues[0].message,
      )}`,
    );
  }

  const booking = await prisma.booking.findUnique({
    where: { id: parsed.data.bookingId },
    include: { leg: true, outboundLeg: true, returnLeg: true, review: true },
  });
  if (!booking) redirect('/account?error=booking_missing');
  // Ownership check
  if (
    booking.customerId !== session.sub &&
    booking.customerEmail.toLowerCase() !== session.email.toLowerCase()
  ) {
    redirect('/account?error=not_your_booking');
  }
  if (booking.status !== 'CONFIRMED') {
    redirect('/account?error=not_confirmed');
  }
  const mainLeg = getMainLeg(booking)!;
  if (mainLeg.departureDate.getTime() > Date.now() - REVIEW_OPENS_AFTER_DEPARTURE_MS) {
    redirect('/account?error=trip_not_finished');
  }
  if (booking.review) {
    redirect('/account?error=already_reviewed');
  }

  await prisma.review.create({
    data: {
      customerId: session.sub,
      bookingId: booking.id,
      scheduleId: mainLeg.scheduleId,
      rating: parsed.data.rating,
      text: parsed.data.text?.trim() || null,
    },
  });

  redirect('/account?ok=review_submitted');
}

export default async function NewReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ bookingId?: string; error?: string }>;
}) {
  const { bookingId, error } = await searchParams;
  const session = await requireCustomer();

  if (!bookingId) redirect('/account');

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      leg: { include: { schedule: { include: { boat: true } } } },
      outboundLeg: { include: { schedule: { include: { boat: true } } } },
      returnLeg: { include: { schedule: { include: { boat: true } } } },
      review: true,
    },
  });
  if (!booking) redirect('/account?error=booking_missing');
  if (
    booking.customerId !== session.sub &&
    booking.customerEmail.toLowerCase() !== session.email.toLowerCase()
  ) {
    redirect('/account?error=not_your_booking');
  }
  if (booking.review) {
    redirect(`/b/${booking.bookingReference}`);
  }

  const mainLeg = getMainLeg(booking)!;

  return (
    <div className="mx-auto max-w-[620px] px-5 pb-4 pt-4 sm:px-6">
      <Link
        href="/account"
        className="inline-flex min-h-11 items-center text-sm font-semibold text-brand hover:underline"
      >
        ← My account
      </Link>

      <div className="mt-2 rounded-[32px] border border-brand-line bg-white p-6 shadow-ambient sm:p-10">
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-brand-ink sm:text-[34px]">
          Rate your trip
        </h1>
        <p className="mt-2 text-[15px] text-brand-muted">
          {mainLeg.schedule.originPort} →{' '}
          {mainLeg.schedule.destinationPort} ·{' '}
          {formatLocalDate(mainLeg.departureDate, 'dd MMM yyyy')} ·{' '}
          {formatLocalTime(mainLeg.departureDate)} ·{' '}
          {mainLeg.schedule.boat.name}
        </p>
        <form action={submitReviewAction} className="mt-6 space-y-6">
          <input type="hidden" name="bookingId" value={booking.id} />

          {error ? (
            <p role="alert" className="rounded-[14px] bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              {error}
            </p>
          ) : null}

          <div className="space-y-2">
            <Label>Your rating</Label>
            <StarRating name="rating" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="text">Comments (optional)</Label>
            <Textarea
              id="text"
              name="text"
              rows={5}
              placeholder="How was the journey? Punctual? Comfortable? Anything other travellers should know?"
              maxLength={2000}
              className="rounded-2xl border-brand-line text-base"
            />
          </div>

          <Button type="submit" className="h-14 w-full rounded-2xl bg-brand text-base font-bold text-white hover:bg-brand-dark">
            Submit review
          </Button>
        </form>
      </div>
    </div>
  );
}
