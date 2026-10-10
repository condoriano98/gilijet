import { redirect } from 'next/navigation';
import Link from 'next/link';
import { z } from 'zod';
import { prisma } from '@/shared/server/db';
import { requireCustomer } from '@/shared/server/auth';
import { formatLocalDate, formatLocalTime } from '@/shared/lib/datetime';
import { getMainLeg } from '@/features/booking/helpers';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { Textarea } from '@/shared/ui/textarea';
import { Label } from '@/shared/ui/label';
import { StarRating } from '@/app/(customer)/[locale]/reviews/new/_components/star-rating';

export const metadata = { title: 'Rate your trip · Gilifast' };

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
  if (mainLeg.departureDate.getTime() > Date.now() - 2 * 60 * 60 * 1000) {
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
    <div className="container py-10">
      <div className="mx-auto max-w-xl">
        <Link
          href="/account"
          className="text-sm text-muted-foreground hover:underline"
        >
          ← My account
        </Link>

        <Card className="mt-3">
          <CardHeader>
            <CardTitle>Rate your trip</CardTitle>
            <CardDescription>
              {mainLeg.schedule.originPort} →{' '}
              {mainLeg.schedule.destinationPort} ·{' '}
              {formatLocalDate(mainLeg.departureDate, 'dd MMM yyyy')} ·{' '}
              {formatLocalTime(mainLeg.departureDate)} ·{' '}
              {mainLeg.schedule.boat.name}
            </CardDescription>
          </CardHeader>
          <form action={submitReviewAction}>
            <CardContent className="space-y-4">
              <input type="hidden" name="bookingId" value={booking.id} />

              {error ? (
                <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
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
                  rows={4}
                  placeholder="How was the journey? Punctual? Comfortable? Anything other travellers should know?"
                  maxLength={2000}
                />
              </div>

              <Button type="submit" className="w-full">
                Submit review
              </Button>
            </CardContent>
          </form>
        </Card>
      </div>
    </div>
  );
}
