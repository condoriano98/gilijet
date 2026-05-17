import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { expireStalePendingBookings } from "@/lib/booking-expiry";
import { releaseBookingSeats } from "@/lib/booking-engine";
import {
  refundAmountForCustomer,
  refundTierForCustomer,
} from "@/lib/refunds";
import { audit } from "@/lib/audit";
import { createRefund, isXenditConfigured } from "@/lib/xendit";
import { renderQrSvg } from "@/lib/qr-render";
import { buildQrPayload } from "@/lib/qr";
import { formatLocalDate, formatLocalTime } from "@/lib/datetime";
import { formatIDR } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const cancelInput = z.object({
  reference: z.string(),
  confirmEmail: z.string().email(),
});

/**
 * Customer-initiated cancellation. Requires the customer email on file as
 * a light authorization check (a stronger flow ships in §9.1 expansion).
 */
async function cancelAction(formData: FormData) {
  "use server";
  const parsed = cancelInput.safeParse({
    reference: formData.get("reference"),
    confirmEmail: formData.get("confirmEmail"),
  });
  if (!parsed.success) {
    redirect(
      `/b/${formData.get("reference")}?error=email_required`,
    );
  }
  const ref = parsed.data.reference;

  const booking = await prisma.booking.findUnique({
    where: { bookingReference: ref },
    include: { leg: true, payment: true, refund: true },
  });
  if (!booking) redirect("/b?error=missing");

  if (
    booking.customerEmail.toLowerCase() !==
    parsed.data.confirmEmail.toLowerCase()
  ) {
    redirect(`/b/${ref}?error=email_mismatch`);
  }
  if (booking.status !== "CONFIRMED" && booking.status !== "PENDING_PAYMENT") {
    redirect(`/b/${ref}?error=not_cancellable`);
  }
  if (booking.leg.departureDate.getTime() <= Date.now()) {
    redirect(`/b/${ref}?error=departure_past`);
  }

  const { tier, amount } = refundAmountForCustomer({
    now: new Date(),
    departure: booking.leg.departureDate,
    paidAmount: booking.totalAmount,
  });

  await prisma.$transaction(async (tx) => {
    await tx.booking.update({
      where: { id: booking.id },
      data: { status: "CANCELLED_BY_CUSTOMER" },
    });
    await tx.ticket.updateMany({
      where: { bookingId: booking.id, status: { in: ["ISSUED"] } },
      data: { status: "REFUNDED" },
    });
    if (!booking.refund && amount.gt(0)) {
      await tx.refund.create({
        data: {
          bookingId: booking.id,
          originalAmount: booking.totalAmount,
          refundAmount: amount,
          reason: "customer_request",
          status: "PENDING",
        },
      });
    }
  });
  await releaseBookingSeats(booking.id, "cancelled_by_customer").catch(
    () => {},
  );

  // Best-effort Xendit refund call (if invoice was paid).
  if (
    amount.gt(0) &&
    isXenditConfigured() &&
    booking.payment?.status === "SUCCESSFUL" &&
    booking.payment.gatewayReference
  ) {
    try {
      const r = await createRefund({
        invoiceId: booking.payment.gatewayReference,
        amount: Math.round(Number(amount)),
        reason: `customer_cancellation_${tier.toLowerCase()}`,
      });
      await prisma.refund.update({
        where: { bookingId: booking.id },
        data: {
          status: "PROCESSING",
          gatewayReference: r.id,
          processedAt: new Date(),
        },
      });
    } catch (err) {
      console.error("[cancel] xendit refund failed:", err);
      // Admin will pick it up from the pending queue.
    }
  }

  await audit({
    entityType: "booking",
    entityId: booking.id,
    action: "cancelled_by_customer",
    userRole: "customer",
    newState: { tier, refundAmount: amount.toString() },
  });

  redirect(`/b/${ref}?ok=cancelled`);
}

function statusBadge(status: string) {
  switch (status) {
    case "CONFIRMED":
      return "success" as const;
    case "PENDING_PAYMENT":
      return "warning" as const;
    case "EXPIRED":
    case "CANCELLED_BY_CUSTOMER":
    case "CANCELLED_BY_OPERATOR":
      return "destructive" as const;
    default:
      return "outline" as const;
  }
}

export default async function BookingLookupPage({
  params,
  searchParams,
}: {
  params: Promise<{ reference: string }>;
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const { reference } = await params;
  const { error, ok } = await searchParams;

  await expireStalePendingBookings();

  const booking = await prisma.booking.findUnique({
    where: { bookingReference: reference },
    include: {
      leg: { include: { schedule: { include: { boat: true } } } },
      tickets: { orderBy: { ticketCode: "asc" } },
      refund: true,
      payment: true,
    },
  });
  if (!booking) notFound();

  // Pre-render QR SVGs for the confirmed-ticket case.
  const ticketSvgs: Array<{ ticketCode: string; passengerName: string; svg: string }> =
    [];
  if (booking.status === "CONFIRMED") {
    for (const t of booking.tickets) {
      const svg = await renderQrSvg(buildQrPayload(t.ticketCode));
      ticketSvgs.push({
        ticketCode: t.ticketCode,
        passengerName: t.passengerName,
        svg,
      });
    }
  }

  const departureFuture = booking.leg.departureDate.getTime() > Date.now();
  const refundPreview =
    booking.status === "CONFIRMED" && departureFuture
      ? refundTierForCustomer(new Date(), booking.leg.departureDate)
      : null;
  const canCancel =
    departureFuture &&
    (booking.status === "CONFIRMED" || booking.status === "PENDING_PAYMENT");

  return (
    <div className="container py-8">
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <Link
            href="/"
            className="text-sm text-muted-foreground hover:underline"
          >
            ← Home
          </Link>
          <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Booking</h1>
              <p className="font-mono text-sm text-muted-foreground">
                {booking.bookingReference}
              </p>
            </div>
            <Badge variant={statusBadge(booking.status)} className="text-sm">
              {booking.status.replace(/_/g, " ")}
            </Badge>
          </div>
        </div>

        {ok === "cancelled" ? (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Booking cancelled. If a refund is due it will appear in your
            payment method within 1-3 business days.
          </p>
        ) : null}
        {error ? (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error.replace(/_/g, " ")}
          </p>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>
              {booking.leg.schedule.originPort} →{" "}
              {booking.leg.schedule.destinationPort}
            </CardTitle>
            <CardDescription>
              {formatLocalDate(booking.leg.departureDate, "EEEE, dd MMM yyyy")}{" "}
              ·{" "}
              <span className="font-mono">
                {formatLocalTime(booking.leg.departureDate)}
              </span>{" "}
              WITA · {booking.leg.schedule.boat.name}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <KV label="Customer" value={booking.customerName} />
            <KV label="Email" value={booking.customerEmail} />
            <KV label="Total" value={formatIDR(Number(booking.totalAmount))} />
            {booking.payment ? (
              <KV
                label="Payment"
                value={`${booking.payment.status} · ${booking.payment.method}`}
              />
            ) : null}
            {booking.refund ? (
              <KV
                label="Refund"
                value={`${booking.refund.status} · ${formatIDR(Number(booking.refund.refundAmount))}`}
              />
            ) : null}
          </CardContent>
        </Card>

        {booking.status === "PENDING_PAYMENT" ? (
          <Card>
            <CardContent className="space-y-3 pt-6">
              <p className="text-sm">
                Payment hasn&apos;t completed yet. You have a 30-minute window
                from when you started.
              </p>
              <Button asChild>
                <Link href={`/pay/${booking.bookingReference}`}>
                  Complete payment
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {booking.status === "CONFIRMED" && ticketSvgs.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Boarding passes</CardTitle>
              <CardDescription>
                Show each QR at the dock. Operators scan once per passenger.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              {ticketSvgs.map((t) => (
                <div
                  key={t.ticketCode}
                  className="rounded-lg border bg-white p-4 text-center"
                >
                  <div className="font-semibold">{t.passengerName}</div>
                  <div
                    className="mx-auto mt-2 [&>svg]:h-auto [&>svg]:w-full"
                    dangerouslySetInnerHTML={{ __html: t.svg }}
                  />
                  <div className="mt-2 font-mono text-xs text-muted-foreground">
                    {t.ticketCode}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ) : null}

        {canCancel ? (
          <Card>
            <CardHeader>
              <CardTitle>Cancel booking</CardTitle>
              <CardDescription>
                {refundPreview === "FULL"
                  ? "More than 7 days out — eligible for a 100% refund."
                  : refundPreview === "PARTIAL"
                    ? "3-6 days out — eligible for a 50% refund."
                    : booking.status === "CONFIRMED"
                      ? "Less than 3 days out — no refund per the policy you agreed to."
                      : "Confirm to release these seats."}
              </CardDescription>
            </CardHeader>
            <form action={cancelAction}>
              <CardContent className="space-y-3">
                <input
                  type="hidden"
                  name="reference"
                  value={booking.bookingReference}
                />
                <label className="block space-y-2 text-sm">
                  <span>Confirm your email to cancel</span>
                  <input
                    type="email"
                    name="confirmEmail"
                    required
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                </label>
                <Button type="submit" variant="destructive" size="sm">
                  Cancel booking
                </Button>
              </CardContent>
            </form>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
