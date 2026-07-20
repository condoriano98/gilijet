import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { startPaymentForBooking } from "@/lib/booking-engine";
import { isXenditMock } from "@/lib/xendit";
import { env } from "@/lib/env";
import { formatLocalDateTime } from "@/lib/datetime";
import { formatIDR } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BookingProgress } from "@/components/customer/booking-progress";
import { PaymentCountdown } from "@/components/customer/payment-countdown";
import { AutoRedirect } from "@/components/checkout/auto-redirect";

export default async function PayPage({
  params,
}: {
  params: Promise<{ reference: string }>;
}) {
  const { reference } = await params;
  const booking = await prisma.booking.findUnique({
    where: { bookingReference: reference },
    include: {
      leg: { include: { schedule: { include: { boat: true } } } },
      payment: true,
    },
  });
  if (!booking) notFound();

  if (booking.status === "CONFIRMED") redirect(`/b/${reference}`);
  if (
    booking.status === "EXPIRED" ||
    booking.status === "CANCELLED_BY_CUSTOMER" ||
    booking.status === "CANCELLED_BY_OPERATOR"
  ) {
    redirect(`/b/${reference}`);
  }

  // No real Xendit keys → the built-in dummy checkout.
  if (isXenditMock()) redirect(`/checkout/${reference}`);

  // Use the persisted hosted-checkout URL; regenerate if missing or expired.
  const stored = (booking.payment?.instrumentData ?? null) as { url?: string } | null;
  const expired =
    booking.payment?.expiresAt && booking.payment.expiresAt.getTime() <= Date.now();
  let url = !expired ? stored?.url ?? null : null;
  if (!url) {
    const result = await startPaymentForBooking(booking.id);
    url = result.invoiceUrl;
  }

  const amountLabel = formatIDR(Number(booking.totalAmount));

  return (
    <div className="container py-10">
      <div className="mx-auto max-w-xl">
        <BookingProgress currentStep={3} />
        <Card>
          <CardHeader>
            <CardTitle>Redirecting to secure payment</CardTitle>
            <CardDescription>
              Reference <span className="font-mono">{booking.bookingReference}</span>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <PaymentCountdown
              createdAtIso={booking.createdAt.toISOString()}
              holdMinutes={env.BOOKING_HOLD_MINUTES ?? 30}
            />
            <div className="rounded-md bg-slate-50 p-3">
              <div className="font-medium">
                {booking.leg.schedule.originPort} → {booking.leg.schedule.destinationPort}
              </div>
              <div className="text-xs text-muted-foreground">
                {formatLocalDateTime(booking.leg.departureDate)} WITA · {booking.leg.schedule.boat.name}
              </div>
            </div>
            <div className="flex justify-between border-t pt-3">
              <span className="text-muted-foreground">Amount due</span>
              <span className="font-semibold">{amountLabel}</span>
            </div>
            <div className="rounded-md bg-sky-50 p-3 text-xs text-sky-900">
              You&apos;ll be taken to Xendit&apos;s secure checkout to pay via
              QRIS, e-wallet, bank transfer, or card.
            </div>
            {url ? <AutoRedirect url={url} /> : null}
          </CardContent>
          <CardFooter className="flex-col gap-2">
            {url ? (
              <Button asChild size="lg" className="w-full">
                <a href={url}>Continue to secure payment</a>
              </Button>
            ) : (
              <div className="w-full rounded-md bg-amber-50 p-3 text-center text-xs text-amber-900">
                We couldn&apos;t start the payment. Please try again in a moment.
              </div>
            )}
            <Button asChild variant="ghost" className="w-full">
              <Link href={`/b/${booking.bookingReference}`}>View booking status</Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
