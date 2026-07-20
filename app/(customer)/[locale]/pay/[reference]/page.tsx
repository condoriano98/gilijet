import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { generateSnapToken } from "@/lib/psp";
import { isMidtransMock } from "@/lib/midtrans";
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
import { MidtransSnap } from "@/components/checkout/midtrans-snap";

/** Server action: generate a Midtrans Snap token and re-render the page. */
async function getSnapTokenAction(formData: FormData) {
  "use server";
  const reference = String(formData.get("reference") ?? "");
  const booking = await prisma.booking.findUnique({
    where: { bookingReference: reference },
    select: { id: true, status: true, payment: { select: { gatewayReference: true } } },
  });
  if (!booking || booking.status !== "PENDING_PAYMENT") redirect(`/b/${reference}`);

  // Token already exists — just re-render
  if (booking.payment?.gatewayReference && !booking.payment.gatewayReference.startsWith("mock_")) {
    revalidatePath(`/pay/${reference}`);
    return;
  }

  await generateSnapToken(reference);
  revalidatePath(`/pay/${reference}`);
}

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

  // No real Midtrans keys → the built-in dummy checkout.
  if (isMidtransMock()) redirect(`/checkout/${reference}`);

  const amountLabel = formatIDR(Number(booking.totalAmount));

  // Existing valid Snap token (replay from re-render after action)
  const snapToken =
    booking.payment?.gatewayReference &&
    !booking.payment.gatewayReference.startsWith("mock_")
      ? booking.payment.gatewayReference
      : null;

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

            <div className="border-t pt-4">
              {snapToken ? (
                <MidtransSnap
                  snapToken={snapToken}
                  bookingReference={booking.bookingReference}
                  amountLabel={amountLabel}
                  isProduction={env.MIDTRANS_IS_PRODUCTION}
                />
              ) : (
                <form action={getSnapTokenAction}>
                  <input
                    type="hidden"
                    name="reference"
                    value={booking.bookingReference}
                  />
                  <Button type="submit" className="w-full" size="lg">
                    Continue to payment
                  </Button>
                </form>
              )}
              <p className="mt-3 text-center text-xs text-slate-500">
                Payments processed securely by Midtrans
              </p>
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
