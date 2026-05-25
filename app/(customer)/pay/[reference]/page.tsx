import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { startPaymentForBooking } from "@/lib/booking-engine";
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

async function retryInvoiceAction(formData: FormData) {
  "use server";
  const reference = String(formData.get("reference") ?? "");
  const booking = await prisma.booking.findUnique({
    where: { bookingReference: reference },
  });
  if (!booking) redirect("/");
  if (booking.status !== "PENDING_PAYMENT") redirect(`/b/${reference}`);

  const result = await startPaymentForBooking(booking.id);
  if (result.invoiceUrl) redirect(result.invoiceUrl);
  redirect(`/pay/${reference}`);
}

function isRealPSP(): boolean {
  const mayarKey = env.MAYAR_API_KEY;
  const hasRealMayar =
    Boolean(mayarKey) && mayarKey !== "mock" && !mayarKey?.startsWith("test_");
  return hasRealMayar || Boolean(env.XENDIT_SECRET_KEY);
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

  // No real PSP → use the built-in dummy checkout
  if (!isRealPSP()) {
    redirect(`/checkout/${reference}`);
  }

  // Real PSP: show the redirect page
  const gatewayRef = booking.payment?.gatewayReference ?? null;
  let invoiceUrl: string | null = null;
  if (gatewayRef) {
    if (gatewayRef.startsWith("http")) {
      invoiceUrl = gatewayRef;
    } else if (env.MAYAR_API_KEY) {
      const mayarHost = env.MAYAR_IS_PRODUCTION ? "mayar.id" : "mayar.club";
      invoiceUrl = `https://${mayarHost}/payment/${gatewayRef}`;
    } else {
      invoiceUrl = `https://invoice.xendit.co/web/invoices/${gatewayRef}`;
    }
  }

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
              <span className="font-semibold">
                {formatIDR(Number(booking.totalAmount))}
              </span>
            </div>
            <div className="rounded-md bg-sky-50 p-3 text-xs text-sky-900">
              You&apos;ll be redirected to a secure checkout to pay via
              QRIS, e-wallet, bank transfer, or card.
            </div>
          </CardContent>
          <CardFooter className="flex-col gap-2">
            {invoiceUrl ? (
              <Button asChild size="lg" className="w-full">
                <a href={invoiceUrl}>
                  Pay {formatIDR(Number(booking.totalAmount))}
                </a>
              </Button>
            ) : null}
            <form action={retryInvoiceAction} className="w-full">
              <input
                type="hidden"
                name="reference"
                value={booking.bookingReference}
              />
              <Button type="submit" variant="outline" className="w-full">
                Generate a new invoice
              </Button>
            </form>
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
