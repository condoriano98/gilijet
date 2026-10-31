import { customerBookingStatusLabel } from '@/features/booking/status-label';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { z } from 'zod';
import { prisma } from '@/shared/server/db';
import { expireStalePendingBookings } from '@/features/booking/expiry';
import { releaseBookingSeats } from '@/features/booking/engine';
import {
  refundAmountForCustomer,
  refundTierForCustomer,
} from '@/features/refunds/refunds';
import { audit } from '@/shared/server/audit';
import { refundViaGateway, isAnyRefundGatewayConfigured } from '@/features/refunds/refund-gateway';
import { loadActiveSeasons, withSeasonPrice } from '@/features/pricing/seasons';
import { renderQrSvgDataUrl } from '@/features/tickets/qr-render';
import { buildQrPayload } from '@/features/tickets/qr';
import { formatLocalDate, formatLocalTime } from '@/shared/lib/datetime';
import { formatIDR } from '@/shared/lib/utils';
import { getMainLeg, getReturnLeg, getAllLegsForBooking } from '@/features/booking/helpers';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/ui/card';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { BookingProgress } from '@/features/booking/components/booking-progress';
import { CopyButton } from '@/features/booking/components/payment-countdown';
import { ShareButtons } from '@/app/(customer)/[locale]/b/[reference]/_components/share-buttons';
import { getPortInfo } from '@/features/ports/port-info';
import { env } from '@/shared/server/env';
import { recordBookingEvent } from '@/features/marketing/events';
import { loadBrowserPurchase } from '@/features/marketing/browser-purchase';
import { TrackEvent } from '@/features/marketing/components/track-event';
import { MS_PER_HOUR } from '@/shared/constants/time';
import { REFUND_CUTOFF_HOURS } from '@/features/refunds/constants';

const CARD = 'rounded-3xl border-brand-line shadow-none';
const CARD_HEAD = 'space-y-1.5 p-5 sm:p-6';
const CARD_TITLE = 'font-display text-xl font-extrabold leading-tight tracking-tight text-brand-ink sm:text-2xl';

const cancelInput = z.object({
  reference: z.string(),
  confirmEmail: z.string().email(),
});

/**
 * Customer-initiated cancellation. Requires the customer email on file as
 * a light authorization check (a stronger flow ships in §9.1 expansion).
 */
async function cancelAction(formData: FormData) {
  'use server';
  const parsed = cancelInput.safeParse({
    reference: formData.get('reference'),
    confirmEmail: formData.get('confirmEmail'),
  });
  if (!parsed.success) {
    redirect(
      `/b/${formData.get('reference')}?error=email_required`,
    );
  }
  const ref = parsed.data.reference;

  const booking = await prisma.booking.findUnique({
    where: { bookingReference: ref },
    include: { leg: true, outboundLeg: true, returnLeg: true, payment: true, refund: true },
  });
  if (!booking) redirect('/b?error=missing');

  if (
    booking.customerEmail.toLowerCase() !==
    parsed.data.confirmEmail.toLowerCase()
  ) {
    redirect(`/b/${ref}?error=email_mismatch`);
  }
  // A booking still waiting on the operator call is cancellable too — the
  // customer has paid and is entitled to back out on the normal refund tiers.
  if (
    booking.status !== 'CONFIRMED' &&
    booking.status !== 'PENDING_PAYMENT' &&
    booking.status !== 'AWAITING_CONFIRMATION'
  ) {
    redirect(`/b/${ref}?error=not_cancellable`);
  }
  const mainLeg = getMainLeg(booking)!;
  if (mainLeg.departureDate.getTime() <= Date.now()) {
    redirect(`/b/${ref}?error=departure_past`);
  }

  const { tier, amount: tierAmount } = refundAmountForCustomer({
    now: new Date(),
    departure: mainLeg.departureDate,
    paidAmount: booking.totalAmount,
  });
  // A booking still waiting for payment has taken no money, so nothing is owed
  // back whatever the tier says.
  const amount = booking.status === 'PENDING_PAYMENT' ? tierAmount.mul(0) : tierAmount;

  await prisma.$transaction(async (tx) => {
    await tx.booking.update({
      where: { id: booking.id },
      data: { status: 'CANCELLED_BY_CUSTOMER' },
    });
    await recordBookingEvent(tx, 'booking_cancelled', booking.id, {
      value: null,
      properties: { cancelled_by: 'customer', paid: booking.payment?.status === 'SUCCESSFUL', refund_tier: tier },
    });
    await tx.ticket.updateMany({
      where: { bookingId: booking.id, status: { in: ['ISSUED'] } },
      data: { status: 'REFUNDED' },
    });
    if (!booking.refund && amount.gt(0)) {
      await tx.refund.create({
        data: {
          bookingId: booking.id,
          originalAmount: booking.totalAmount,
          refundAmount: amount,
          reason: 'CUSTOMER_REQUEST',
          status: 'PENDING',
        },
      });
    }
  });
  await releaseBookingSeats(booking.id, 'cancelled_by_customer').catch(
    () => {},
  );

  // Best-effort gateway refund call (if the invoice was paid).
  if (
    amount.gt(0) &&
    isAnyRefundGatewayConfigured() &&
    booking.payment?.status === 'SUCCESSFUL' &&
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
            status: 'PROCESSING',
            gatewayReference: r.id,
            processedAt: new Date(),
          },
        });
      }
    } catch (err) {
      console.error('[cancel] gateway refund failed:', err);
      // Admin will pick it up from the pending queue.
    }
  }

  await audit({
    entityType: 'BOOKING',
    entityId: booking.id,
    action: 'cancelled_by_customer',
    userRole: 'CUSTOMER',
    newState: { tier, refundAmount: amount.toString() },
  });

  redirect(`/b/${ref}?ok=cancelled`);
}

function statusBadge(status: string) {
  switch (status) {
    case 'CONFIRMED':
      return 'success' as const;
    case 'PENDING_PAYMENT':
    case 'AWAITING_CONFIRMATION':
      return 'warning' as const;
    case 'EXPIRED':
    case 'CANCELLED_BY_CUSTOMER':
    case 'CANCELLED_BY_OPERATOR':
      return 'destructive' as const;
    default:
      return 'outline' as const;
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
      outboundLeg: {
        include: {
          schedule: { include: { boat: { include: { operator: true } } } },
        },
      },
      returnLeg: {
        include: {
          schedule: { include: { boat: { include: { operator: true } } } },
        },
      },
      tickets: { orderBy: { ticketCode: 'asc' } },
      refund: true,
      payment: true,
      rescheduleRequest: true,
      review: true,
    },
  });
  if (!booking) notFound();
  const browserPurchase = await loadBrowserPurchase(booking.id);

  // Look up return-leg suggestions for future confirmed bookings.
  const mainLeg = getMainLeg(booking)!;
  let returnLegs: Array<{
    id: string;
    departureDate: Date;
    basePrice: unknown;
    schedule: { originPort: string; destinationPort: string; durationMinutes: number; boat: { name: string } };
  }> = [];
  if (booking.status === 'CONFIRMED' && mainLeg.departureDate.getTime() > Date.now()) {
    try {
      const rawReturnLegs = await prisma.leg.findMany({
        where: {
          status: 'OPEN',
          departureDate: { gt: mainLeg.departureDate },
          schedule: {
            originPort: mainLeg.schedule.destinationPort,
            destinationPort: mainLeg.schedule.originPort,
            status: 'ACTIVE',
            deletedAt: null,
            boat: { deletedAt: null },
          },
        },
        include: { schedule: { include: { boat: true } } },
        orderBy: { departureDate: 'asc' },
        take: 3,
      });
      returnLegs = withSeasonPrice(rawReturnLegs, await loadActiveSeasons());
    } catch (err) {
      console.error('[booking] return leg query failed:', err);
    }
  }

  const portInfo = getPortInfo(mainLeg.schedule.originPort);
  const lookupUrl = `${env.APP_BASE_URL ?? ''}/b/${booking.bookingReference}`;

  // Pre-render QR data URLs for the confirmed-ticket case. Rendering to a
  // data URL + <img> avoids dangerouslySetInnerHTML; the QR library output
  // is fully server-controlled, but using <img> keeps that property local
  // to the renderer.
  const ticketSvgs: Array<{ ticketCode: string; passengerName: string; qrDataUrl: string }> =
    [];
  if (booking.status === 'CONFIRMED') {
    for (const t of booking.tickets) {
      const qrDataUrl = await renderQrSvgDataUrl(
        buildQrPayload(t.ticketCode, mainLeg.departureDate),
      );
      ticketSvgs.push({
        ticketCode: t.ticketCode,
        passengerName: t.passengerName,
        qrDataUrl,
      });
    }
  }

  const departureFuture = mainLeg.departureDate.getTime() > Date.now();
  const refundPreview =
    booking.status === 'CONFIRMED' && departureFuture
      ? refundTierForCustomer(new Date(), mainLeg.departureDate)
      : null;
  const canCancel =
    departureFuture &&
    (booking.status === 'CONFIRMED' ||
      booking.status === 'PENDING_PAYMENT' ||
      booking.status === 'AWAITING_CONFIRMATION');

  return (
    <div className="mx-auto max-w-[1180px] px-5 py-6 sm:px-6 sm:py-8">
      {browserPurchase ? (
        <TrackEvent
          eventId={browserPurchase.eventId}
          name="purchase"
          requires="marketing"
          params={{
            transaction_id: browserPurchase.transactionId,
            value: browserPurchase.value,
            currency: browserPurchase.currency,
            items: [{ item_id: browserPurchase.route ?? 'journey', item_name: browserPurchase.route ?? 'journey', quantity: browserPurchase.passengers }],
          }}
        />
      ) : null}
      <div className="min-w-0 space-y-6">
        {booking.status === 'CONFIRMED' && <BookingProgress currentStep={4} />}
        <div>
          <Link
            href="/"
            className="inline-flex min-h-11 items-center text-sm font-semibold text-brand hover:underline"
          >
            ← Home
          </Link>
          <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="font-display text-3xl font-extrabold tracking-tight text-brand-ink sm:text-[34px]">Booking</h1>
              <p className="break-all font-mono text-[15px] text-brand-muted">
                {booking.bookingReference}
                <CopyButton value={booking.bookingReference} />
              </p>
            </div>
            <Badge variant={statusBadge(booking.status)} className="rounded-full px-4 py-2 text-sm font-bold">
              {customerBookingStatusLabel(booking.status)}
            </Badge>
          </div>
        </div>

        {ok === 'cancelled' ? (
          <p className="rounded-2xl bg-amber-100 px-4 py-3.5 text-sm text-amber-900">
            Booking cancelled. If a refund is due it will appear in your
            payment method within 1-3 business days.
          </p>
        ) : null}
        {error ? (
          <p className="rounded-2xl bg-red-50 px-4 py-3.5 text-sm text-red-700">
            {error.replace(/_/g, ' ')}
          </p>
        ) : null}

        <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-8">
        <div className="min-w-0 space-y-5">
        <Card className={CARD}>
          <CardHeader className={CARD_HEAD}>
            <CardTitle className={CARD_TITLE}>
              {mainLeg.schedule.originPort} →{' '}
              {mainLeg.schedule.destinationPort}
            </CardTitle>
            <CardDescription className="text-sm text-brand-muted">
              {formatLocalDate(mainLeg.departureDate, 'EEEE, dd MMM yyyy')}{' '}
              ·{' '}
              <span className="font-mono">
                {formatLocalTime(mainLeg.departureDate)}
              </span>{' '}
              WITA · {mainLeg.schedule.boat.name}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5 px-5 pb-5 text-sm sm:px-6 sm:pb-6">
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

        {booking.status === 'PENDING_PAYMENT' ? (
          <Card className={CARD}>
            <CardContent className="space-y-3 p-5 sm:p-6">
              <p className="text-sm text-brand-text">
                Payment hasn&apos;t completed yet. You have a 30-minute window
                from when you started.
              </p>
              <Button asChild className="h-12 rounded-[14px] bg-brand px-6 font-bold text-white hover:bg-brand-dark">
                <Link href={`/pay/${booking.bookingReference}`}>
                  Complete payment
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {booking.status === 'AWAITING_CONFIRMATION' ? (
          <Card className="rounded-3xl border-amber-200 bg-amber-50 shadow-none">
            <CardContent className="space-y-2 p-5 sm:p-6">
              <p className="text-[17px] font-extrabold text-amber-900">
                Payment received — we&apos;re confirming your seat
              </p>
              <p className="text-sm text-amber-900">
                We check every departure directly with the boat operator before
                issuing a boarding pass. Yours will arrive by email and WhatsApp
                once that&apos;s done, usually within a few hours.
              </p>
              <p className="text-sm text-amber-900">
                Please don&apos;t travel to the harbour until you have it. If
                the operator can&apos;t take this departure we&apos;ll cancel
                and refund you in full.
              </p>
            </CardContent>
          </Card>
        ) : null}

        {booking.status === 'CONFIRMED' && ticketSvgs.length > 0 ? (
          <Card className={CARD}>
            <CardHeader className={CARD_HEAD}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className={CARD_TITLE}>Boarding passes</CardTitle>
                  <CardDescription className="text-sm text-brand-muted">
                    Show each QR at the dock. Operators scan once per passenger.
                  </CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button asChild variant="outline" size="sm" className="h-11 rounded-[14px] border-brand px-4 font-bold text-brand hover:bg-brand-periwinkle">
                    <a href={`/api/bookings/${booking.bookingReference}/ics`} download>
                      Add to calendar
                    </a>
                  </Button>
                  <Button asChild size="sm" className="h-11 rounded-[14px] bg-brand px-4 font-bold text-white hover:bg-brand-dark">
                    <a
                      href={`/api/bookings/${booking.bookingReference}/boarding-pass`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Boarding pass PDF
                    </a>
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4 px-5 pb-5 sm:grid-cols-2 sm:px-6 sm:pb-6">
              {ticketSvgs.map((t) => (
                <div
                  key={t.ticketCode}
                  className="min-w-0 rounded-2xl border border-brand-line bg-white p-4 text-center"
                >
                  <div className="font-semibold text-brand-ink">{t.passengerName}</div>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={t.qrDataUrl}
                    alt={`QR code for ticket ${t.ticketCode}`}
                    className="mx-auto mt-2 h-auto w-full max-w-full"
                  />
                  <div className="mt-2 break-all font-mono text-xs text-brand-muted">
                    {t.ticketCode}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ) : null}

        {booking.status === 'CONFIRMED' ? (
          <Card className={CARD}>
            <CardHeader className={CARD_HEAD}>
              <CardTitle className={CARD_TITLE}>Before you board</CardTitle>
              <CardDescription className="text-sm text-brand-muted">
                Arrive at {mainLeg.schedule.originPort} dock at least{' '}
                <strong>{portInfo.arrivalBuffer} minutes</strong> before
                departure.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2.5 px-5 pb-5 text-sm sm:px-6 sm:pb-6">
              {mainLeg.schedule.boat.photos.length > 0 ? (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {mainLeg.schedule.boat.photos.map((url) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={url}
                      src={url}
                      alt={mainLeg.schedule.boat.name}
                      className="h-28 w-44 flex-shrink-0 rounded-2xl border border-brand-line object-cover"
                    />
                  ))}
                </div>
              ) : null}
              <KV label="Dock address" value={portInfo.address} />
              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${portInfo.lat},${portInfo.lng}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center text-sm font-semibold text-brand hover:underline"
              >
                Get directions →
              </a>
              <p className="text-xs text-brand-muted">{portInfo.dockTip}</p>
              <KV
                label="Operator"
                value={mainLeg.schedule.boat.operator.companyName}
              />
              <KV
                label="Contact"
                value={mainLeg.schedule.boat.operator.phoneNumber}
              />
              <p className="pt-2 text-xs text-brand-muted">
                Bring: a government ID matching each passenger name, motion
                sickness tablets if you need them, a light jacket for the
                crossing.
              </p>
            </CardContent>
          </Card>
        ) : null}
        </div>

        <div className="min-w-0 space-y-5">
        {booking.status === 'CONFIRMED' ? (
          <>
            <Card className={CARD}>
              <CardHeader className={CARD_HEAD}>
                <CardTitle className={CARD_TITLE}>Share this booking</CardTitle>
                <CardDescription className="text-sm text-brand-muted">
                  Send the reference to a travel companion or save the link.
                </CardDescription>
              </CardHeader>
              <CardContent className="px-5 pb-5 sm:px-6 sm:pb-6">
                <ShareButtons
                  bookingReference={booking.bookingReference}
                  origin={mainLeg.schedule.originPort}
                  destination={mainLeg.schedule.destinationPort}
                  date={formatLocalDate(mainLeg.departureDate, 'dd MMM yyyy')}
                  lookupUrl={lookupUrl}
                />
              </CardContent>
            </Card>

            {returnLegs.length > 0 ? (
              <Card className={CARD}>
                <CardHeader className={CARD_HEAD}>
                  <CardTitle className={CARD_TITLE}>
                    Book your return: {mainLeg.schedule.destinationPort} →{' '}
                    {mainLeg.schedule.originPort}
                  </CardTitle>
                  <CardDescription className="text-sm text-brand-muted">
                    Available departures after your outbound trip.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2.5 px-5 pb-5 sm:px-6 sm:pb-6">
                  {returnLegs.map((rl) => (
                    <div
                      key={rl.id}
                      className="flex flex-col gap-3 rounded-2xl border border-brand-line bg-white px-4 py-3 text-sm"
                    >
                      <div>
                        <div className="font-semibold text-brand-ink">
                          {formatLocalDate(rl.departureDate, 'EEE, dd MMM')} ·{' '}
                          <span className="font-mono">
                            {formatLocalTime(rl.departureDate)}
                          </span>
                        </div>
                        <div className="text-xs text-brand-muted">
                          {rl.schedule.boat.name} ·{' '}
                          {rl.schedule.durationMinutes} min ·{' '}
                          {formatIDR(Number(rl.basePrice))}
                        </div>
                      </div>
                      <Button asChild size="sm" variant="outline" className="h-11 w-full rounded-[14px] border-brand font-bold text-brand hover:bg-brand-periwinkle">
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

        {booking.status === 'CONFIRMED' &&
        departureFuture &&
        mainLeg.departureDate.getTime() > Date.now() + REFUND_CUTOFF_HOURS * MS_PER_HOUR ? (
          <Card className={CARD}>
            <CardHeader className={CARD_HEAD}>
              <CardTitle className={CARD_TITLE}>Change of plans?</CardTitle>
              <CardDescription className="text-sm text-brand-muted">
                Request a different date or time on the same route. Subject to
                operator approval and seat availability.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-5 pb-5 sm:px-6 sm:pb-6">
              {booking.rescheduleRequest?.status === 'PENDING' ? (
                <p className="text-sm text-amber-900">
                  Reschedule request pending operator review.
                </p>
              ) : (
                <Button asChild variant="outline" size="sm" className="h-11 rounded-[14px] border-brand px-5 font-bold text-brand hover:bg-brand-periwinkle">
                  <Link href={`/b/${booking.bookingReference}/reschedule`}>
                    Request date change
                  </Link>
                </Button>
              )}
            </CardContent>
          </Card>
        ) : null}

        {canCancel ? (
          <Card className={CARD}>
            <CardHeader className={CARD_HEAD}>
              <CardTitle className={CARD_TITLE}>Cancel booking</CardTitle>
              <CardDescription className="text-sm text-brand-muted">
                {refundPreview === 'FULL'
                  ? 'More than 7 days out — eligible for a 100% refund.'
                  : refundPreview === 'PARTIAL'
                    ? '3-6 days out — eligible for a 50% refund.'
                    : booking.status === 'CONFIRMED'
                      ? 'Less than 3 days out — no refund per the policy you agreed to.'
                      : 'Confirm to release these seats.'}
              </CardDescription>
            </CardHeader>
            <form action={cancelAction}>
              <CardContent className="space-y-3 px-5 pb-5 sm:px-6 sm:pb-6">
                <input
                  type="hidden"
                  name="reference"
                  value={booking.bookingReference}
                />
                <label className="block space-y-2 text-sm font-semibold text-brand-ink">
                  <span>Confirm your email to cancel</span>
                  <input
                    type="email"
                    name="confirmEmail"
                    required
                    className="flex h-12 w-full rounded-[14px] border border-brand-line bg-white px-3.5 py-2 text-sm font-normal"
                  />
                </label>
                <Button type="submit" variant="destructive" size="sm" className="h-11 rounded-[14px] px-5 font-bold">
                  Cancel booking
                </Button>
              </CardContent>
            </form>
          </Card>
        ) : null}
        </div>
        </div>
      </div>
    </div>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="shrink-0 text-brand-muted">{label}</span>
      <span className="min-w-0 break-words text-right font-semibold text-brand-ink">{value}</span>
    </div>
  );
}
