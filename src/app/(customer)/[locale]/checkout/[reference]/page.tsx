import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/shared/server/db';
import { recordPaymentAwaitingConfirmation } from '@/features/tickets/ticket-issuer';
import { notifyPaymentReceived } from '@/features/booking/notifications';
import { env } from '@/shared/server/env';
import { formatLocalDateTime } from '@/shared/lib/datetime';
import { formatIDR } from '@/shared/lib/utils';
import { normalizePaymentMethod } from '@/features/payments/psp';
import { isDokuMock } from '@/features/payments/doku';
import { PaymentMethod } from '@prisma/client';
import { BookingProgress } from '@/features/booking/components/booking-progress';
import { DummyCheckoutForm } from '@/app/(customer)/[locale]/checkout/[reference]/_components/dummy-checkout-form';
import { getMainLeg } from '@/features/booking/helpers';

export const dynamic = 'force-dynamic';

async function simulatePayment(formData: FormData) {
  'use server';
  // Hard gate: the dummy checkout may confirm a booking / issue a ticket ONLY
  // when the real gateway is unconfigured. With live keys the real payment
  // flow goes through /pay + the signed webhook; never confirm here.
  if (!isDokuMock()) notFound();
  const reference = String(formData.get('reference') ?? '');
  const outcome = String(formData.get('outcome') ?? 'success');
  const method = String(formData.get('method') ?? 'card');
  if (!reference) redirect('/');

  const booking = await prisma.booking.findUnique({
    where: { bookingReference: reference },
    include: { leg: { include: { schedule: { include: { boat: true } } } }, outboundLeg: { include: { schedule: { include: { boat: true } } } }, returnLeg: { include: { schedule: { include: { boat: true } } } } },
  });
  if (!booking) redirect('/');
  if (booking.status !== 'PENDING_PAYMENT') {
    redirect(`/b/${reference}`);
  }

  if (outcome === 'fail') {
    redirect(`/checkout/${reference}?failed=1`);
  }

  const methodEnum = (() => {
    try {
      return normalizePaymentMethod(method);
    } catch {
      return PaymentMethod.BANK_TRANSFER;
    }
  })();

  const result = await recordPaymentAwaitingConfirmation({
    bookingId: booking.id,
    paidAt: new Date(),
    method: methodEnum,
    gatewayFee: 0,
    gatewayReference: `DEMO-${Date.now()}`,
  });

  if (!result.alreadyRecorded) {
    await notifyPaymentReceived(booking.id).catch((err) =>
      console.error('[checkout] notify failed:', err),
    );
  }

  redirect(`/b/${reference}`);
}

export default async function CheckoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ reference: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  // Dummy checkout is only reachable when the real gateway is unconfigured.
  if (!isDokuMock()) notFound();
  const { reference } = await params;
  const { failed } = await searchParams;
  const booking = await prisma.booking.findUnique({
    where: { bookingReference: reference },
    include: {
      leg: { include: { schedule: { include: { boat: true } } } },
      outboundLeg: { include: { schedule: { include: { boat: true } } } },
      returnLeg: { include: { schedule: { include: { boat: true } } } },
      payment: true,
    },
  });
  if (!booking) notFound();
  const mainLeg = getMainLeg(booking)!;

  // Anything past PENDING_PAYMENT — already paid, expired or cancelled — has
  // nothing left to pay for here.
  if (booking.status !== 'PENDING_PAYMENT') redirect(`/b/${reference}`);

  const holdMinutes = env.BOOKING_HOLD_MINUTES ?? 30;
  const expiresAt = new Date(
    booking.createdAt.getTime() + holdMinutes * 60_000,
  );

  return (
    <div className="container py-8">
      <div className="mx-auto max-w-lg">
        <BookingProgress currentStep={3} />

        {failed === '1' && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            Payment was cancelled. Please try again.
          </div>
        )}

        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-start justify-between">
            <div>
              <h1 className="text-lg font-semibold text-slate-900">
                {mainLeg.schedule.originPort} →{' '}
                {mainLeg.schedule.destinationPort}
              </h1>
              <p className="mt-0.5 text-xs text-slate-500">
                {formatLocalDateTime(mainLeg.departureDate)} WITA ·{' '}
                {mainLeg.schedule.boat.name}
              </p>
              <p className="mt-0.5 text-xs text-slate-400">
                Ref{' '}
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
