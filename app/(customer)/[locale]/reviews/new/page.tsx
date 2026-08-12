import { redirect } from "next/navigation";
import Link from "next/link";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireCustomer } from "@/lib/auth";
import { formatLocalDate, formatLocalTime } from "@/lib/datetime";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { StarRating } from "@/components/customer/star-rating";

export const metadata = { title: "Rate your trip · Gilifast" };

const reviewSchema = z.object({
  bookingId: z.string().min(1),
  rating: z.coerce.number().int().min(1).max(5),
  text: z.string().max(2000).optional().or(z.literal("")),
});

async function submitReviewAction(formData: FormData) {
  "use server";
  const session = await requireCustomer();

  const parsed = reviewSchema.safeParse({
    bookingId: formData.get("bookingId"),
    rating: formData.get("rating"),
    text: formData.get("text"),
  });
  if (!parsed.success) {
    redirect(
      `/reviews/new?bookingId=${formData.get("bookingId")}&error=${encodeURIComponent(
        parsed.error.issues[0].message,
      )}`,
    );
  }

  const booking = await prisma.booking.findUnique({
    where: { id: parsed.data.bookingId },
    include: { leg: true, review: true },
  });
  if (!booking) redirect("/account?error=booking_missing");
  // Ownership check
  if (
    booking.customerId !== session.sub &&
    booking.customerEmail.toLowerCase() !== session.email.toLowerCase()
  ) {
    redirect("/account?error=not_your_booking");
  }
  if (booking.status !== "CONFIRMED") {
    redirect("/account?error=not_confirmed");
  }
  if (booking.leg.departureDate.getTime() > Date.now() - 2 * 60 * 60 * 1000) {
    redirect("/account?error=trip_not_finished");
  }
  if (booking.review) {
    redirect("/account?error=already_reviewed");
  }

  await prisma.review.create({
    data: {
      customerId: session.sub,
      bookingId: booking.id,
      scheduleId: booking.leg.scheduleId,
      rating: parsed.data.rating,
      text: parsed.data.text?.trim() || null,
    },
  });

  redirect("/account?ok=review_submitted");
}

export default async function NewReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ bookingId?: string; error?: string }>;
}) {
  const { bookingId, error } = await searchParams;
  const session = await requireCustomer();

  if (!bookingId) redirect("/account");

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      leg: { include: { schedule: { include: { boat: true } } } },
      review: true,
    },
  });
  if (!booking) redirect("/account?error=booking_missing");
  if (
    booking.customerId !== session.sub &&
    booking.customerEmail.toLowerCase() !== session.email.toLowerCase()
  ) {
    redirect("/account?error=not_your_booking");
  }
  if (booking.review) {
    redirect(`/b/${booking.bookingReference}`);
  }

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
              {booking.leg.schedule.originPort} →{" "}
              {booking.leg.schedule.destinationPort} ·{" "}
              {formatLocalDate(booking.leg.departureDate, "dd MMM yyyy")} ·{" "}
              {formatLocalTime(booking.leg.departureDate)} ·{" "}
              {booking.leg.schedule.boat.name}
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
