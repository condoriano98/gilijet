import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { confirmPaymentAndIssueTickets } from "@/lib/ticket-issuer";
import { sendBookingConfirmation } from "@/lib/email";
import { env } from "@/lib/env";
import { formatLocalDateTime } from "@/lib/datetime";
import { formatIDR } from "@/lib/utils";
import { BookingProgress } from "@/components/customer/booking-progress";
import { DummyCheckoutForm } from "@/components/checkout/dummy-checkout-form";

export const dynamic = "force-dynamic";

async function simulatePayment(formData: FormData) {
  "use server";
  const reference = String(formData.get("reference") ?? "");
  const outcome = String(formData.get("outcome") ?? "success");
  const method = String(formData.get("method") ?? "card");
  if (!reference) redirect("/");

  const booking = await prisma.booking.findUnique({
    where: { bookingReference: reference },
    include: { leg: { include: { schedule: { include: { boat: true } } } } },
  });
  if (!booking) redirect("/");
  if (booking.status !== "PENDING_PAYMENT") {
    redirect(`/b/${reference}`);
  }

  if (outcome === "fail") {
    redirect(`/checkout/${reference}?failed=1`);
  }

  const result = await confirmPaymentAndIssueTickets({
    bookingId: booking.id,
    paidAt: new Date(),
    method: `demo_${method}`,
    gatewayFee: 0,
    gatewayReference: `DEMO-${Date.now()}`,
  });

  await sendBookingConfirmation({
    to: booking.customerEmail,
    customerName: booking.customerName,
    bookingReference: result.bookingReference,
    route: {
      originPort: booking.leg.schedule.originPort,
      destinationPort: booking.leg.schedule.destinationPort,
    },
    boatName: booking.leg.schedule.boat.name,
    departureDate: booking.leg.departureDate,
    totalAmount: Number(booking.totalAmount),
    lookupUrl: `${env.APP_BASE_URL}/b/${result.bookingReference}`,
    tickets: result.tickets,
  }).catch((err) => console.error("[email] checkout send failed:", err));

  redirect(`/b/${reference}`);
}

export default async function CheckoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ reference: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { reference } = await params;
  const { failed } = await searchParams;
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

  const holdMinutes = env.BOOKING_HOLD_MINUTES ?? 30;
  const expiresAt = new Date(
    booking.createdAt.getTime() + holdMinutes * 60_000,
  );

  return (
    <div className="container py-8">
      <div className="mx-auto max-w-lg">
        <BookingProgress currentStep={3} />

        {failed === "1" && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            Payment was cancelled. Please try again.
          </div>
        )}

        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-start justify-between">
            <div>
              <h1 className="text-lg font-semibold text-slate-900">
                {booking.leg.schedule.originPort} →{" "}
                {booking.leg.schedule.destinationPort}
              </h1>
              <p className="mt-0.5 text-xs text-slate-500">
                {formatLocalDateTime(booking.leg.departureDate)} WITA ·{" "}
                {booking.leg.schedule.boat.name}
              </p>
              <p className="mt-0.5 text-xs text-slate-400">
                Ref{" "}
                <span className="font-mono">{booking.bookingReference}</span>
              </p>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-slate-900">
                {formatIDR(Number(booking.totalAmount))}
              </div>
            </div>
          </div>

          <div className="border-t pt-5">
            <DummyCheckoutForm
              reference={booking.bookingReference}
              amount={Number(booking.totalAmount)}
              customerEmail={booking.customerEmail}
              expiresAtIso={expiresAt.toISOString()}
              simulateAction={simulatePayment}
            />
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <Link
            href={`/b/${booking.bookingReference}`}
            className="text-xs text-slate-400 hover:text-slate-600 hover:underline"
          >
            View booking status
          </Link>
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-700">
            Test Mode
          </span>
        </div>
      </div>
    </div>
  );
}
