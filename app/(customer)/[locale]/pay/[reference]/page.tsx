import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import {
  capturePaypalOrder,
  quotePaypalIfAvailable,
  startDokuCheckout,
  startPaypalOrder,
} from "@/lib/psp";
import { isDokuMock } from "@/lib/doku";
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
import { DokuRedirect } from "@/components/checkout/doku-redirect";
import { PaypalButton } from "@/components/checkout/paypal-button";

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
    // Send them back to DOKU rather than charging a guessed rate.
    console.error(`[pay] could not open PayPal order for ${reference}:`, err);
    redirect(`/pay/${reference}?error=paypal`);
  }
  if (!approveUrl) throw new Error("PayPal did not return an approve URL");
  redirect(approveUrl);
}

export default async function PayPage({
  params,
  searchParams,
}: {
  params: Promise<{ reference: string }>;
  searchParams: Promise<{ error?: string; paypal?: string; token?: string }>;
}) {
  const { reference } = await params;
  const { error, paypal, token } = await searchParams;
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

  // Back from PayPal with an approved order. Capture and issue tickets here
  // rather than waiting for the webhook: PayPal has already taken the money
  // client-side, so a delayed webhook would leave a paid customer ticketless
  // while the hold counts down. The webhook later no-ops as a duplicate.
  let paypalError: string | null = null;
  if (paypal === "return") {
    const outcome = await capturePaypalOrder(reference, token);
    if (outcome.ok) redirect(`/b/${reference}`);
    paypalError = outcome.reason;
  } else if (paypal === "cancel") {
    paypalError = "PayPal payment was cancelled. You can try again.";
  }

  // No real DOKU keys → the built-in dummy checkout.
  if (isDokuMock()) redirect(`/checkout/${reference}`);

  const amountLabel = formatIDR(Number(booking.totalAmount));

  // PayPal is only offered when it can name a price: live keys plus a fresh FX
  // rate. A stale rate means no offer, never a guessed conversion.
  const paypalQuote = await quotePaypalIfAvailable(Number(booking.totalAmount));

  // A recorded DOKU decline is exactly why someone would need the backup, so
  // lead with it rather than leaving them to retry the card that just failed.
  const dokuDeclined = Boolean(booking.payment?.failedReason);

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
              {error === "paypal" ? (
                <p className="rounded-md bg-rose-50 p-3 text-center text-xs text-rose-700">
                  PayPal is temporarily unavailable. Please use the option below.
                </p>
              ) : null}
              {paypalError ? (
                <p className="rounded-md bg-rose-50 p-3 text-center text-xs text-rose-700">
                  {paypalError}
                </p>
              ) : null}
              {dokuDeclined ? (
                <p className="rounded-md bg-amber-50 p-3 text-center text-xs text-amber-800">
                  Your last payment did not go through. You can try again, or
                  pay by card through PayPal below.
                </p>
              ) : null}

              <DokuRedirect
                bookingReference={booking.bookingReference}
                amountLabel={amountLabel}
                startAction={startPaymentAction}
              />

              {!paypalQuote && isPaypalLive() ? (
                <p className="text-center text-xs text-slate-500">
                  Card payment via PayPal is temporarily unavailable. The
                  options above still work.
                </p>
              ) : null}

              {paypalQuote ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <span className="h-px flex-1 bg-slate-200" />
                    <span className="text-xs uppercase tracking-wide text-slate-400">
                      or
                    </span>
                    <span className="h-px flex-1 bg-slate-200" />
                  </div>
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
