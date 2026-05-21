import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { confirmPaymentAndIssueTickets } from "@/lib/ticket-issuer";
import { sendBookingConfirmation } from "@/lib/email";
import { env } from "@/lib/env";
import { formatLocalDateTime } from "@/lib/datetime";
import { formatIDR } from "@/lib/utils";
import { CheckoutMethods } from "@/components/checkout/methods";
import { CheckoutCountdown } from "@/components/checkout/countdown";

// Dummy Xendit-style hosted invoice page. The whole route lives outside
// the (customer) layout so there's no Gilijet header/footer — same as
// a real PSP checkout takes over the viewport.

export const dynamic = "force-dynamic";

async function simulatePayment(formData: FormData) {
  "use server";
  const reference = String(formData.get("reference") ?? "");
  const outcome = String(formData.get("outcome") ?? "success");
  const method = String(formData.get("method") ?? "qris");
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
    redirect(`/pay/${reference}?failed=1`);
  }

  const result = await confirmPaymentAndIssueTickets({
    bookingId: booking.id,
    paidAt: new Date(),
    method,
    gatewayFee: 0,
    gatewayReference: `MOCK-${Date.now()}`,
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

  const holdMinutes = env.BOOKING_HOLD_MINUTES ?? 30;
  const expiresAt = new Date(
    booking.createdAt.getTime() + holdMinutes * 60_000,
  );

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-gradient-to-br from-sky-500 to-cyan-400 text-sm font-bold text-white">
              G
            </div>
            <span className="text-sm font-semibold tracking-tight text-slate-900">
              GilijetPay
            </span>
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
              Demo
            </span>
          </div>
          <div className="hidden text-xs text-slate-500 sm:block">
            Secure checkout · 256-bit TLS
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 py-6">
        <div className="grid gap-5 lg:grid-cols-[340px_1fr]">
          {/* Order summary */}
          <aside className="space-y-4">
            <div className="rounded-xl border bg-white p-5 shadow-sm">
              <div className="text-xs uppercase tracking-wide text-slate-500">
                Invoice
              </div>
              <div className="mt-1 text-sm font-mono text-slate-900">
                {booking.bookingReference}
              </div>
              <div className="mt-1 text-xs text-slate-500">Merchant · Gilijet</div>

              <div className="mt-4 border-t pt-4 text-sm">
                <div className="font-semibold text-slate-900">
                  {booking.leg.schedule.originPort} →{" "}
                  {booking.leg.schedule.destinationPort}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {formatLocalDateTime(booking.leg.departureDate)} WITA
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {booking.leg.schedule.boat.name}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  Passenger · {booking.customerName}
                </div>
              </div>

              <div className="mt-4 border-t pt-4">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm text-slate-500">Amount due</span>
                  <span className="text-2xl font-bold text-slate-900">
                    {formatIDR(Number(booking.totalAmount))}
                  </span>
                </div>
              </div>

              <div className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <CheckoutCountdown expiresAtIso={expiresAt.toISOString()} />
              </div>
            </div>

            <div className="rounded-xl border bg-white p-4 text-xs text-slate-500">
              <div className="mb-2 font-semibold text-slate-700">
                Need help?
              </div>
              <div>WhatsApp +62 812-3456-7890</div>
              <div className="mt-1">support@gilijet.com</div>
            </div>
          </aside>

          {/* Method selector */}
          <main className="rounded-xl border bg-white p-5 shadow-sm">
            <h1 className="text-lg font-semibold text-slate-900">
              Choose payment method
            </h1>
            <p className="mt-1 text-xs text-slate-500">
              This is a demo checkout — no real money moves. Pick a method and
              click <strong>I have paid</strong> to confirm.
            </p>

            <CheckoutMethods
              reference={booking.bookingReference}
              amount={Number(booking.totalAmount)}
              simulateAction={simulatePayment}
            />
          </main>
        </div>

        <footer className="mx-auto max-w-5xl px-2 py-6 text-center text-xs text-slate-400">
          Powered by GilijetPay (demo) · This screen mimics a hosted invoice
          checkout for testing.
        </footer>
      </div>
    </div>
  );
}
