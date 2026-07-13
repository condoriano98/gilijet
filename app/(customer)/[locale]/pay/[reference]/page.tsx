import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { createDokuInstrument } from "@/lib/psp";
import { isDokuMock, type DokuInstrument, type DokuMethodChoice } from "@/lib/doku";
import { env } from "@/lib/env";
import { formatLocalDateTime } from "@/lib/datetime";
import { formatIDR } from "@/lib/utils";
import { renderQrSvg } from "@/lib/qr-render";
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
import { DokuMethodPicker } from "@/components/checkout/doku-method-picker";
import { VaInstrument } from "@/components/checkout/va-instrument";
import { PaymentStatusPoller } from "@/components/checkout/payment-status-poller";

// Create the DOKU instrument for the chosen method, then either redirect
// (e-wallet / card) or re-render this page showing the instrument (VA / QRIS).
async function selectMethodAction(formData: FormData) {
  "use server";
  const reference = String(formData.get("reference") ?? "");
  const kind = String(formData.get("kind") ?? "QRIS");

  const booking = await prisma.booking.findUnique({
    where: { bookingReference: reference },
    select: { id: true, status: true },
  });
  if (!booking || booking.status !== "PENDING_PAYMENT") redirect(`/b/${reference}`);

  const choice = (
    kind === "VA"
      ? { kind: "VA", bank: String(formData.get("bank") || "BCA") }
      : kind === "EWALLET"
        ? { kind: "EWALLET", wallet: String(formData.get("wallet") || "OVO") }
        : kind === "CARD"
          ? { kind: "CARD" }
          : { kind: "QRIS" }
  ) as DokuMethodChoice;

  const { instrument } = await createDokuInstrument(booking.id, choice);
  if (instrument.type === "REDIRECT") redirect(instrument.url);
  if (instrument.type === "CARD_3DS") redirect(instrument.redirectUrl);
  if (instrument.type === "MOCK") redirect(instrument.url);
  revalidatePath(`/pay/${reference}`);
}

async function resetMethodAction(formData: FormData) {
  "use server";
  const reference = String(formData.get("reference") ?? "");
  const booking = await prisma.booking.findUnique({
    where: { bookingReference: reference },
    select: { id: true },
  });
  if (booking) {
    await prisma.payment.update({
      where: { bookingId: booking.id },
      data: { instrumentData: Prisma.DbNull, expiresAt: null },
    });
  }
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

  // No real DOKU keys → the built-in dummy checkout.
  if (isDokuMock()) redirect(`/checkout/${reference}`);

  const amountLabel = formatIDR(Number(booking.totalAmount));
  const instrument = (booking.payment?.instrumentData ?? null) as DokuInstrument | null;
  const expiresAt = booking.payment?.expiresAt ?? null;
  const active =
    instrument &&
    (instrument.type === "VA" || instrument.type === "QRIS") &&
    (!expiresAt || expiresAt.getTime() > Date.now());

  const qrSvg =
    active && instrument.type === "QRIS"
      ? await renderQrSvg(instrument.qrString)
      : null;

  return (
    <div className="container py-10">
      <div className="mx-auto max-w-xl">
        <BookingProgress currentStep={3} />
        <Card>
          <CardHeader>
            <CardTitle>Complete payment</CardTitle>
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

            {active ? (
              <div className="space-y-4 border-t pt-4">
                {instrument.type === "VA" ? (
                  <VaInstrument
                    bank={instrument.bank}
                    vaNumber={instrument.vaNumber}
                    amountLabel={amountLabel}
                  />
                ) : (
                  <div className="flex flex-col items-center gap-3 rounded-[10px] border border-slate-200 bg-white p-4">
                    <div
                      className="h-56 w-56 [&>svg]:h-full [&>svg]:w-full"
                      // eslint-disable-next-line react/no-danger
                      dangerouslySetInnerHTML={{ __html: qrSvg ?? "" }}
                    />
                    <div className="text-xs text-slate-600">
                      Scan with any Indonesian bank or e-wallet app supporting QRIS
                    </div>
                  </div>
                )}
                <PaymentStatusPoller reference={booking.bookingReference} />
                <form action={resetMethodAction}>
                  <input type="hidden" name="reference" value={booking.bookingReference} />
                  <button
                    type="submit"
                    className="w-full text-center text-xs text-slate-500 hover:text-brand hover:underline"
                  >
                    Choose a different payment method
                  </button>
                </form>
              </div>
            ) : (
              <div className="border-t pt-4">
                <div className="mb-3 text-sm font-medium text-slate-900">
                  Choose how to pay
                </div>
                <DokuMethodPicker
                  reference={booking.bookingReference}
                  selectAction={selectMethodAction}
                />
                <p className="mt-3 text-center text-xs text-slate-500">
                  Payments processed securely by DOKU
                </p>
              </div>
            )}
          </CardContent>
          <CardFooter>
            <Button asChild variant="ghost" className="w-full">
              <Link href={`/b/${booking.bookingReference}`}>View booking status</Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
