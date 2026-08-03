import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { startDokuCheckout } from "@/lib/psp";
import { isDokuMock } from "@/lib/doku";
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
import { DokuRedirect } from "@/components/checkout/doku-redirect";

/** Server action: open a DOKU checkout and send the customer to it. */
async function startPaymentAction(formData: FormData) {
  "use server";
  const reference = String(formData.get("reference") ?? "");
  const booking = await prisma.booking.findUnique({
    where: { bookingReference: reference },
    select: { status: true },
  });
  if (!booking || booking.status !== "PENDING_PAYMENT") redirect(`/b/${reference}`);

  let paymentUrl: string;
  try {
    paymentUrl = (await startDokuCheckout(reference)).paymentUrl;
  } catch (err) {
    if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
    console.error(`[pay] could not open DOKU checkout for ${reference}:`, err);
    redirect(`/pay/${reference}?error=gateway`);
  }
  redirect(paymentUrl);
}

export default async function PayPage({
  params,
  searchParams,
}: {
  params: Promise<{ reference: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { reference } = await params;
  const { error } = await searchParams;
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

  // No real DOKU keys → the built-in dummy checkout.
  if (isDokuMock()) redirect(`/checkout/${reference}`);

  const amountLabel = formatIDR(Number(booking.totalAmount));

  return (
    <div className="container py-10">
      <div className="mx-auto max-w-xl">
        <BookingProgress currentStep={3} />
        <Card>
          <CardHeader>
            <CardTitle>Complete payment</CardTitle>
            <CardDescription>
              Reference{" "}
              <span className="font-mono">{booking.bookingReference}</span>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <PaymentCountdown
              createdAtIso={booking.createdAt.toISOString()}
              holdMinutes={env.BOOKING_HOLD_MINUTES ?? 30}
            />
            <div className="rounded-md bg-slate-50 p-3">
              <div className="font-medium">
                {booking.leg.schedule.originPort} →{" "}
                {booking.leg.schedule.destinationPort}
              </div>
              <div className="text-xs text-muted-foreground">
                {formatLocalDateTime(booking.leg.departureDate)} WITA ·{" "}
                {booking.leg.schedule.boat.name}
              </div>
            </div>
            <div className="flex justify-between border-t pt-3">
              <span className="text-muted-foreground">Amount due</span>
              <span className="font-semibold">{amountLabel}</span>
            </div>

            <div className="space-y-4 border-t pt-4">
              {error === "gateway" ? (
                <p className="rounded-md bg-rose-50 p-3 text-center text-xs text-rose-700">
                  The payment gateway did not respond. Please try again.
                </p>
              ) : null}
              <DokuRedirect
                bookingReference={booking.bookingReference}
                amountLabel={amountLabel}
                startAction={startPaymentAction}
              />
            </div>
          </CardContent>
          <CardFooter>
            <Button asChild variant="ghost" className="w-full">
              <Link href={`/b/${booking.bookingReference}`}>
                View booking status
              </Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
