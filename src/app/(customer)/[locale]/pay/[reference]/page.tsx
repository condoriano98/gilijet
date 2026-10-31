import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/shared/server/db';
import {
  capturePaypalOrder,
  quotePaypalIfAvailable,
  startDokuCheckout,
  startPaypalOrder,
} from '@/features/payments/psp';
import { isDokuMock, pingDoku } from '@/features/payments/doku';
import { isPaypalLive, paypalHost } from '@/features/payments/paypal';
import { applyGatewayModeOverrides } from '@/features/payments/payment-mode';
import { env } from '@/shared/server/env';
import { formatLocalDateTime } from '@/shared/lib/datetime';
import { formatIDR } from '@/shared/lib/utils';
import { getMainLeg } from '@/features/booking/helpers';
import { Button } from '@/shared/ui/button';
import { BookingProgress } from '@/features/booking/components/booking-progress';
import { PaymentCountdown } from '@/features/booking/components/payment-countdown';
import { DokuRedirect } from '@/app/(customer)/[locale]/pay/[reference]/_components/doku-redirect';
import { PaypalButton } from '@/app/(customer)/[locale]/pay/[reference]/_components/paypal-button';

/** Server action: open a DOKU checkout and send the customer to it. */
async function startPaymentAction(formData: FormData) {
  'use server';
  const reference = String(formData.get('reference') ?? '');
  const booking = await prisma.booking.findUnique({
    where: { bookingReference: reference },
    select: { status: true },
  });
  if (!booking || booking.status !== 'PENDING_PAYMENT') redirect(`/b/${reference}`);

  let paymentUrl: string;
  try {
    paymentUrl = (await startDokuCheckout(reference)).paymentUrl;
  } catch (err) {
    if (err instanceof Error && err.message === 'NEXT_REDIRECT') throw err;
    console.error(`[pay] could not open DOKU checkout for ${reference}:`, err);
    redirect(`/pay/${reference}?error=gateway`);
  }
  redirect(paymentUrl);
}

/** Server action: open a PayPal order and send the customer to approve it. */
async function startPaypalAction(formData: FormData) {
  'use server';
  const reference = String(formData.get('reference') ?? '');
  const booking = await prisma.booking.findUnique({
    where: { bookingReference: reference },
    select: { status: true },
  });
  if (!booking || booking.status !== 'PENDING_PAYMENT') redirect(`/b/${reference}`);

  let approveUrl: string | null;
  try {
    approveUrl = (await startPaypalOrder(reference)).approveUrl;
  } catch (err) {
    if (err instanceof Error && err.message === 'NEXT_REDIRECT') throw err;
    // The rate can go stale between rendering the button and clicking it.
    // Send them back to DOKU rather than charging a guessed rate.
    console.error(`[pay] could not open PayPal order for ${reference}:`, err);
    redirect(`/pay/${reference}?error=paypal`);
  }
  if (!approveUrl) throw new Error('PayPal did not return an approve URL');
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

  // Reflect any console sandbox/live override before deciding what the page
  // says about each gateway (see lib/payment-mode.ts).
  await applyGatewayModeOverrides();

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

  if (booking.status === 'CONFIRMED') redirect(`/b/${reference}`);
  if (
    booking.status === 'EXPIRED' ||
    booking.status === 'CANCELLED_BY_CUSTOMER' ||
    booking.status === 'CANCELLED_BY_OPERATOR'
  ) {
    redirect(`/b/${reference}`);
  }

  // Back from PayPal with an approved order. Capture here rather than waiting
  // for the webhook: PayPal has already taken the money client-side, so a
  // delayed webhook would leave a paid booking counting down its hold timer.
  // The webhook later no-ops as a duplicate.
  let paypalError: string | null = null;
  if (paypal === 'return') {
    const outcome = await capturePaypalOrder(reference, token);
    if (outcome.ok) redirect(`/b/${reference}`);
    paypalError = outcome.reason;
  } else if (paypal === 'cancel') {
    paypalError = 'PayPal payment was cancelled. You can try again.';
  }

  // No real DOKU keys → the built-in dummy checkout.
  if (isDokuMock()) redirect(`/checkout/${reference}`);

  const amountLabel = formatIDR(Number(booking.totalAmount));

  // PayPal is only offered when it can name a price: live keys plus a fresh FX
  // rate. A stale rate means no offer, never a guessed conversion.
  const paypalQuote = await quotePaypalIfAvailable(Number(booking.totalAmount));

  // The credentials decide which PayPal host we talk to, so a live-looking site
  // can end up on sandbox. A sandbox capture still issues a real ticket for a
  // real sailing while no money moves, so say so before anyone pays.
  const paypalIsTestMode = Boolean(paypalQuote) && paypalHost() === 'sandbox';

  // Same warning for DOKU: real keys pointed at the sandbox host collect test
  // payments that would still confirm a booking.
  const doku = pingDoku();
  const dokuIsTestMode = !isDokuMock() && doku.mode === 'sandbox';

  // A recorded DOKU decline is exactly why someone would need the backup, so
  // lead with it rather than leaving them to retry the card that just failed.
  const dokuDeclined = Boolean(booking.payment?.failedReason);

  return (
    <div className="mx-auto max-w-[1180px] px-5 py-6 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-[720px]">
        <BookingProgress currentStep={3} />
        <div className="rounded-[28px] border border-brand-line bg-white p-5 shadow-ambient sm:p-8">
          <div>
            <h1 className="font-display text-2xl font-extrabold tracking-tight text-brand-ink sm:text-3xl">
              Complete payment
            </h1>
            <p className="mt-1.5 text-sm text-brand-muted">
              Reference{' '}
              <span className="font-mono font-semibold text-brand-ink">{booking.bookingReference}</span>
            </p>
          </div>
          <div className="mt-5 space-y-4 text-sm">
            <PaymentCountdown
              createdAtIso={booking.createdAt.toISOString()}
              holdMinutes={env.BOOKING_HOLD_MINUTES ?? 30}
            />
            <div className="rounded-2xl border border-brand-line bg-slate-50 px-4 py-4">
              <div className="text-[17px] font-bold text-brand-ink">
                {mainLeg.schedule.originPort} →{' '}
                {mainLeg.schedule.destinationPort}
              </div>
              <div className="mt-1 text-sm text-brand-muted">
                {formatLocalDateTime(mainLeg.departureDate)} WITA ·{' '}
                {mainLeg.schedule.boat.name}
              </div>
            </div>
            <div className="flex items-baseline justify-between border-t border-brand-line pt-4">
              <span className="text-[15px] text-brand-muted">Amount due</span>
              <span className="text-2xl font-extrabold tracking-tight text-brand sm:text-3xl">{amountLabel}</span>
            </div>

            <div className="space-y-4 border-t border-brand-line pt-4">
              {error === 'gateway' ? (
                <p className="rounded-[14px] bg-red-50 px-4 py-3 text-center text-[13px] text-red-800">
                  The payment gateway did not respond. Please try again.
                </p>
              ) : null}
              {error === 'paypal' ? (
                <p className="rounded-[14px] bg-red-50 px-4 py-3 text-center text-[13px] text-red-800">
                  PayPal is temporarily unavailable. Please use the option below.
                </p>
              ) : null}
              {paypalError ? (
                <p className="rounded-[14px] bg-red-50 px-4 py-3 text-center text-[13px] text-red-800">
                  {paypalError}
                </p>
              ) : null}
              {dokuDeclined ? (
                <p className="rounded-[14px] bg-amber-50 px-4 py-3 text-center text-[13px] text-amber-900">
                  Your last payment did not go through. You can try again, or
                  pay by card through PayPal below.
                </p>
              ) : null}

              {dokuIsTestMode ? (
                <p className="rounded-[14px] bg-amber-50 px-4 py-2.5 text-center text-xs font-semibold text-amber-900">
                  DOKU is in test mode — no real payment will be taken.
                </p>
              ) : null}

              <DokuRedirect
                bookingReference={booking.bookingReference}
                amountLabel={amountLabel}
                startAction={startPaymentAction}
              />

              {!paypalQuote && isPaypalLive() ? (
                <p className="text-center text-[13px] text-brand-muted">
                  Card payment via PayPal is temporarily unavailable. The
                  options above still work.
                </p>
              ) : null}

              {paypalQuote ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <span className="h-px flex-1 bg-brand-line" />
                    <span className="text-xs uppercase tracking-wider text-brand-muted">
                      or
                    </span>
                    <span className="h-px flex-1 bg-brand-line" />
                  </div>
                  <PaypalButton
                    bookingReference={booking.bookingReference}
                    presentmentLabel={`${paypalQuote.amount} ${paypalQuote.currency}`}
                    idrLabel={amountLabel}
                    startAction={startPaypalAction}
                  />
                  {paypalIsTestMode ? (
                    <p className="rounded-[14px] bg-amber-50 px-4 py-2.5 text-center text-xs font-semibold text-amber-900">
                      PayPal is in test mode — no real payment will be taken.
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
          <div className="mt-5">
            <Button asChild variant="ghost" className="min-h-12 w-full rounded-[14px] text-[15px] font-semibold text-brand hover:bg-brand-surface hover:text-brand">
              <Link href={`/b/${booking.bookingReference}`}>
                View booking status
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
