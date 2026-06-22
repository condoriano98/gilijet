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
import { refundViaGateway, isAnyRefundGatewayConfigured } from "@/lib/refund-gateway";
import { renderQrSvgDataUrl } from "@/lib/qr-render";
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
import { BookingProgress } from "@/components/customer/booking-progress";
import { CopyButton } from "@/components/customer/payment-countdown";
import { ShareButtons } from "@/components/customer/share-buttons";
import { getPortInfo } from "@/lib/port-info";
import { env } from "@/lib/env";

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
          reason: "CUSTOMER_REQUEST",
          status: "PENDING",
        },
      });
    }
  });
  await releaseBookingSeats(booking.id, "cancelled_by_customer").catch(
    () => {},
  );

  // Best-effort gateway refund call (if the invoice was paid).
  if (
    amount.gt(0) &&
    isAnyRefundGatewayConfigured() &&
    booking.payment?.status === "SUCCESSFUL" &&
    booking.payment.gatewayReference
  ) {
    try {
      const r = await refundViaGateway({
        gatewayProvider: booking.payment.gatewayProvider,
        gatewayReference: booking.payment.gatewayReference,
        amount: Math.round(Number(amount)),
        reason: `customer_cancellation_${tier.toLowerCase()}`,
      });
      if (r) {
        await prisma.refund.update({
          where: { bookingId: booking.id },
          data: {
            status: "PROCESSING",
            gatewayReference: r.id,
            processedAt: new Date(),
          },
        });
      }
    } catch (err) {
      console.error("[cancel] gateway refund failed:", err);
      // Admin will pick it up from the pending queue.
    }
  }

  await audit({
    entityType: "BOOKING",
    entityId: booking.id,
    action: "cancelled_by_customer",
    userRole: "CUSTOMER",
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
      leg: {
        include: {
          schedule: { include: { boat: { include: { operator: true } } } },
        },
      },
      tickets: { orderBy: { ticketCode: "asc" } },
      refund: true,
      payment: true,
      rescheduleRequest: true,
      review: true,
    },
  });
  if (!booking) notFound();

  // Look up return-leg suggestions for future confirmed bookings.
  let returnLegs: Array<{
    id: string;
    departureDate: Date;
    basePrice: unknown;
    availableSeats: number;
    schedule: { originPort: string; destinationPort: string; durationMinutes: number; boat: { name: string } };
  }> = [];
  if (booking.status === "CONFIRMED" && booking.leg.departureDate.getTime() > Date.now()) {
    try {
      returnLegs = await prisma.leg.findMany({
        where: {
          status: "OPEN",
          departureDate: { gt: booking.leg.departureDate },
          availableSeats: { gte: Math.max(1, booking.tickets.length) },
          schedule: {
            originPort: booking.leg.schedule.destinationPort,
            destinationPort: booking.leg.schedule.originPort,
            status: "ACTIVE",
            deletedAt: null,
            boat: { deletedAt: null },
          },
        },
        include: { schedule: { include: { boat: true } } },
        orderBy: { departureDate: "asc" },
        take: 3,
      });
    } catch (err) {
      console.error("[booking] return leg query failed:", err);
    }
  }

  const portInfo = getPortInfo(booking.leg.schedule.originPort);
  const lookupUrl = `${env.APP_BASE_URL ?? ""}/b/${booking.bookingReference}`;

  // Pre-render QR data URLs for the confirmed-ticket case. Rendering to a
  // data URL + <img> avoids dangerouslySetInnerHTML; the QR library output
  // is fully server-controlled, but using <img> keeps that property local
  // to the renderer.
  const ticketSvgs: Array<{ ticketCode: string; passengerName: string; qrDataUrl: string }> =
    [];
  if (booking.status === "CONFIRMED") {
    for (const t of booking.tickets) {
      const qrDataUrl = await renderQrSvgDataUrl(
        buildQrPayload(t.ticketCode, booking.leg.departureDate),
      );
      ticketSvgs.push({
        ticketCode: t.ticketCode,
        passengerName: t.passengerName,
        qrDataUrl,
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
        {booking.status === "CONFIRMED" && <BookingProgress currentStep={4} />}
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
                <CopyButton value={booking.bookingReference} />
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
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle>Boarding passes</CardTitle>
                  <CardDescription>
                    Show each QR at the dock. Operators scan once per passenger.
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button asChild variant="outline" size="sm">
                    <a href={`/api/bookings/${booking.bookingReference}/ics`} download>
                      Add to calendar
                    </a>
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <Link
                      href={`/print/b/${booking.bookingReference}`}
                      target="_blank"
                    >
                      Download PDF
                    </Link>
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              {ticketSvgs.map((t) => (
                <div
                  key={t.ticketCode}
                  className="rounded-lg border bg-white p-4 text-center"
                >
                  <div className="font-semibold">{t.passengerName}</div>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={t.qrDataUrl}
                    alt={`QR code for ticket ${t.ticketCode}`}
                    className="mx-auto mt-2 h-auto w-full"
                  />
                  <div className="mt-2 font-mono text-xs text-muted-foreground">
                    {t.ticketCode}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ) : null}

        {booking.status === "CONFIRMED" ? (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Before you board</CardTitle>
                <CardDescription>
                  Arrive at {booking.leg.schedule.originPort} dock at least{" "}
                  <strong>{portInfo.arrivalBuffer} minutes</strong> before
                  departure.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {booking.leg.schedule.boat.photos.length > 0 ? (
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {booking.leg.schedule.boat.photos.map((url) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={url}
                        src={url}
                        alt={booking.leg.schedule.boat.name}
                        className="h-28 w-44 flex-shrink-0 rounded-md border object-cover"
                      />
                    ))}
                  </div>
                ) : null}
                <KV label="Dock address" value={portInfo.address} />
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${portInfo.lat},${portInfo.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block text-xs font-medium text-gilijet-ocean hover:underline"
                >
                  Get directions →
                </a>
                <p className="text-xs text-muted-foreground">{portInfo.dockTip}</p>
                <KV
                  label="Operator"
                  value={booking.leg.schedule.boat.operator.companyName}
                />
                <KV
                  label="Contact"
                  value={booking.leg.schedule.boat.operator.phoneNumber}
                />
                <p className="pt-2 text-xs text-muted-foreground">
                  Bring: a government ID matching each passenger name, motion
                  sickness tablets if you need them, a light jacket for the
                  crossing.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Share this booking</CardTitle>
                <CardDescription>
                  Send the reference to a travel companion or save the link.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ShareButtons
                  bookingReference={booking.bookingReference}
                  origin={booking.leg.schedule.originPort}
                  destination={booking.leg.schedule.destinationPort}
                  date={formatLocalDate(booking.leg.departureDate, "dd MMM yyyy")}
                  lookupUrl={lookupUrl}
                />
              </CardContent>
            </Card>

            {returnLegs.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle>
                    Book your return: {booking.leg.schedule.destinationPort} →{" "}
                    {booking.leg.schedule.originPort}
                  </CardTitle>
                  <CardDescription>
                    Available departures after your outbound trip.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {returnLegs.map((rl) => (
                    <div
                      key={rl.id}
                      className="flex flex-col gap-2 rounded-md border bg-white px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <div className="font-medium">
                          {formatLocalDate(rl.departureDate, "EEE, dd MMM")} ·{" "}
                          <span className="font-mono">
                            {formatLocalTime(rl.departureDate)}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {rl.schedule.boat.name} ·{" "}
                          {rl.schedule.durationMinutes} min ·{" "}
                          {formatIDR(Number(rl.basePrice))}
                        </div>
                      </div>
                      <Button asChild size="sm" variant="outline" className="w-full sm:w-auto">
                        <Link
                          href={`/book/${rl.id}?passengers=${Math.max(1, booking.tickets.length)}`}
                        >
                          Book return
                        </Link>
                      </Button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ) : null}
          </>
        ) : null}

        {booking.status === "CONFIRMED" &&
        departureFuture &&
        booking.leg.departureDate.getTime() > Date.now() + 48 * 60 * 60 * 1000 ? (
          <Card>
            <CardHeader>
              <CardTitle>Change of plans?</CardTitle>
              <CardDescription>
                Request a different date or time on the same route. Subject to
                operator approval and seat availability.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {booking.rescheduleRequest?.status === "PENDING" ? (
                <p className="text-sm text-amber-900">
                  Reschedule request pending operator review.
                </p>
              ) : (
                <Button asChild variant="outline" size="sm">
                  <Link href={`/b/${booking.bookingReference}/reschedule`}>
                    Request date change
                  </Link>
                </Button>
              )}
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
