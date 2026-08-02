import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import {
  capturePaypalOrder,
  generateSnapToken,
  quotePaypalIfAvailable,
  startPaypalOrder,
} from "@/lib/psp";
import { isMidtransMock } from "@/lib/midtrans";
import { isPaypalLive } from "@/lib/paypal";
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
import { PaypalButton } from "@/components/checkout/paypal-button";

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

/** Server action: open a PayPal order and send the customer to approve it. */
async function startPaypalAction(formData: FormData) {
  "use server";
  const reference = String(formData.get("reference") ?? "");
  const booking = await prisma.booking.findUnique({
    where: { bookingReference: reference },
    select: { status: true },
  });
  if (!booking || booking.status !== "PENDING_PAYMENT") redirect(`/b/${reference}`);

  let approveUrl: string | null;
  try {
    approveUrl = (await startPaypalOrder(reference)).approveUrl;
  } catch (err) {
    if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
    // The rate can go stale between rendering the button and clicking it.
    // Send the customer back to Midtrans rather than charging a guessed rate.
    console.error(`[pay] could not open PayPal order for ${reference}:`, err);
    redirect(`/pay/${reference}?paypal=unavailable`);
  }
  if (!approveUrl) throw new Error("PayPal did not return an approve URL");
  redirect(approveUrl);
}

export default async function PayPage({
  params,
  searchParams,
}: {
  params: Promise<{ reference: string }>;
  searchParams: Promise<{ paypal?: string; token?: string }>;
}) {
  const { reference } = await params;
  const { paypal, token } = await searchParams;
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

  let paypalError: string | null = null;
  if (paypal === "cancel") {
    paypalError = "PayPal payment was cancelled. You can try again.";
  } else if (paypal === "unavailable") {
    paypalError = "PayPal is temporarily unavailable. Please pay via Midtrans below.";
  }

  // Back from PayPal with an approved order. Capture and issue tickets here
  // rather than waiting for the webhook: PayPal has already taken the money
  // client-side, so a delayed webhook would leave a paid customer ticketless
  // while the hold timer counts down. The webhook later no-ops as a duplicate.
  if (paypal === "return") {
    const outcome = await capturePaypalOrder(reference, token);
    if (outcome.ok) redirect(`/b/${reference}`);
    paypalError = outcome.reason;
  }

  // Neither gateway can take money → the built-in dummy checkout.
  const midtransAvailable = !isMidtransMock();
  if (!midtransAvailable && !isPaypalLive()) redirect(`/checkout/${reference}`);

  const amountLabel = formatIDR(Number(booking.totalAmount));

  // PayPal is only offered when it can name a price: live keys plus a fresh
  // FX rate. A stale rate means no offer, never a guessed conversion.
  const paypalQuote = await quotePaypalIfAvailable(Number(booking.totalAmount));

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

            <div className="space-y-4 border-t pt-4">
              {paypalError ? (
                <p className="rounded-md bg-rose-50 p-3 text-center text-xs text-rose-700">
                  {paypalError}
                </p>
              ) : null}

              {midtransAvailable ? (
                <div className="space-y-3">
                  {snapToken ? (
                    <MidtransSnap
                      snapToken={snapToken}
                      bookingReference={booking.bookingReference}
                      amountLabel={amountLabel}
                      clientKey={env.MIDTRANS_CLIENT_KEY ?? ""}
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
                  <p className="text-center text-xs text-slate-500">
                    Bank transfer, QRIS, GoPay, ShopeePay and convenience store
                  </p>
                </div>
              ) : null}

              {paypalQuote ? (
                <div className="space-y-3">
                  {midtransAvailable ? (
                    <div className="flex items-center gap-3">
                      <span className="h-px flex-1 bg-slate-200" />
                      <span className="text-xs uppercase tracking-wide text-slate-400">
                        or
                      </span>
                      <span className="h-px flex-1 bg-slate-200" />
                    </div>
                  ) : null}
                  <PaypalButton
                    bookingReference={booking.bookingReference}
                    presentmentLabel={`${paypalQuote.amount} ${paypalQuote.currency}`}
                    idrLabel={amountLabel}
                    startAction={startPaypalAction}
                  />
                </div>
              ) : null}
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
