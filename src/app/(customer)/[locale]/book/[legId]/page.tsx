import { randomUUID } from 'node:crypto';
import { TrackEvent } from '@/features/marketing/components/track-event';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { z } from 'zod';
import { prisma } from '@/shared/server/db';
import {
  reserveSeatsAndCreateBooking,
  startPaymentForBooking,
  releaseBookingSeats,
  BookingError,
} from '@/features/booking/engine';
import { expireStalePendingBookings } from '@/features/booking/expiry';
import { formatLocalDate, formatLocalTime } from '@/shared/lib/datetime';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Textarea } from '@/shared/ui/textarea';
import { PassengerFields } from '@/app/(customer)/[locale]/book/[legId]/_components/passenger-fields';
import { ContactFields } from './contact-fields';
import { PromoCodeInput } from '@/app/(customer)/[locale]/book/[legId]/_components/promo-code-input';
import { BookingProgress } from '@/features/booking/components/booking-progress';
import { SubmitBookingButton } from '@/app/(customer)/[locale]/book/[legId]/_components/submit-booking-button';
import { BookingPriceProvider } from '@/app/(customer)/[locale]/book/[legId]/_components/booking-price-provider';
import { BookingPriceSummary } from '@/app/(customer)/[locale]/book/[legId]/_components/booking-price-summary';
import { getCustomerSession } from '@/shared/server/auth';
import type { PassengerType } from '@/features/pricing/pricing';
import { loadActiveSeasons, legPricingInputs } from '@/features/pricing/seasons';
import { recordBookingEventStandalone } from '@/features/marketing/events';
import { readBookingAttribution } from '@/features/marketing/booking-attribution';
import { cookies, headers } from 'next/headers';
import { resolvePlatformPricing } from '@/shared/server/platform-config';

const NAMES_MIN = 2;
const PHONE_MIN = 6;

function clampPassengerCount(raw: FormDataEntryValue[]): string[] {
  const arr = raw.map((v) => String(v).trim()).filter(Boolean);
  return arr.slice(0, 10);
}

const bookingFormSchema = z.object({
  customerName: z.string().min(NAMES_MIN).max(120),
  customerEmail: z.string().email(),
  customerPhone: z.string().min(PHONE_MIN).max(40),
  customerNationality: z
    .string()
    .trim()
    .min(1, 'Nationality is required')
    .max(80),
  notes: z.string().max(500).optional().or(z.literal('')),
  agreedToTerms: z.string().optional(),
});

/** Acquisition snapshot for the booking, read from the visitor's cookies. */
async function readRequestAttribution() {
  const [jar, hdrs] = await Promise.all([cookies(), headers()]);
  return readBookingAttribution({
    cookie: (name) => jar.get(name)?.value,
    allCookieNames: jar.getAll().map((c) => c.name),
    userAgent: hdrs.get('user-agent'),
    ip: hdrs.get('x-forwarded-for'),
  });
}

async function submitBookingAction(formData: FormData) {
  'use server';

  const legId = String(formData.get('legId') ?? '');
  const outboundLegId = String(formData.get('outboundLegId') ?? '');
  const returnLegId = String(formData.get('returnLegId') ?? '');
  const isRoundTrip = !!outboundLegId && !!returnLegId;

  if (!legId && !isRoundTrip) redirect('/');

  const passengerNames = clampPassengerCount(formData.getAll('passengerName'));
  const passengerIds = formData.getAll('passengerIdNumber').map((v) => String(v).trim());
  const passengerTypesRaw = formData.getAll('passengerType').map((v) => String(v).trim());
  const passengerTypes: PassengerType[] = passengerNames.map((_, idx) => {
    const t = passengerTypesRaw[idx];
    return t === 'CHILD' || t === 'INFANT' ? t : 'ADULT';
  });
  const promoCode = String(formData.get('promoCode') ?? '').trim() || null;

  const getErrorRedirectUrl = (message: string) => {
    const basePath = isRoundTrip ? '/book/0' : `/book/${legId}`;
    const params = new URLSearchParams({ error: message });
    if (isRoundTrip) {
      params.set('outboundLegId', outboundLegId);
      params.set('returnLegId', returnLegId);
    }
    return `${basePath}?${params.toString()}`;
  };

  if (passengerNames.length === 0 || passengerNames.some((n) => n.length < NAMES_MIN)) {
    redirect(getErrorRedirectUrl('Each passenger needs a name'));
  }

  const fields = bookingFormSchema.safeParse({
    customerName: formData.get('customerName'),
    customerEmail: formData.get('customerEmail'),
    customerPhone: formData.get('customerPhone'),
    customerNationality: formData.get('customerNationality'),
    notes: formData.get('notes'),
    agreedToTerms: formData.get('agreedToTerms'),
  });
  if (!fields.success) {
    redirect(getErrorRedirectUrl(fields.error.issues[0].message));
  }
  if (!fields.data.agreedToTerms) {
    redirect(getErrorRedirectUrl('Please accept the terms'));
  }

  // If the user is signed in, link the booking to their account.
  const session = await getCustomerSession();

  let created: { bookingId: string; bookingReference: string };
  try {
    const bookingArgs: Parameters<typeof reserveSeatsAndCreateBooking>[0] = {
      ...(isRoundTrip ? { outboundLegId, returnLegId } : { legId }),
      customer: {
        name: fields.data.customerName.trim(),
        email: fields.data.customerEmail.trim(),
        phone: fields.data.customerPhone.trim(),
        nationality: fields.data.customerNationality,
      },
      passengers: passengerNames.map((name, idx) => ({
        name,
        idNumber: passengerIds[idx] || null,
        type: passengerTypes[idx],
      })),
      notes: fields.data.notes || null,
      customerId: session?.sub ?? null,
      promoCode,
      attribution: await readRequestAttribution(),
    };
    created = await reserveSeatsAndCreateBooking(bookingArgs);
  } catch (err) {
    const redirectPath = isRoundTrip
      ? `/book/0?error=${encodeURIComponent(err instanceof BookingError ? err.message : 'Booking failed')}&outboundLegId=${outboundLegId}&returnLegId=${returnLegId}`
      : `/book/${legId}?error=${encodeURIComponent(err instanceof BookingError ? err.message : 'Booking failed')}`;
    redirect(redirectPath);
  }

  let payment: { invoiceUrl: string | null; mock: boolean };
  try {
    payment = await startPaymentForBooking(created.bookingId);
  } catch (err) {
    // Roll back the reservation so seats aren't held forever.
    await releaseBookingSeats(created.bookingId, 'payment_failed').catch(
      () => {},
    );
    await prisma.booking
      .update({
        where: { id: created.bookingId },
        data: { status: 'EXPIRED' },
      })
      .catch(() => {});
    await recordBookingEventStandalone('booking_cancelled', created.bookingId, {
      value: null,
      properties: { cancelled_by: 'payment_setup_failed', paid: false },
    });
    const message = err instanceof Error ? err.message : 'Payment setup failed';
    redirect(getErrorRedirectUrl(message));
  }

  if (payment.invoiceUrl) {
    redirect(payment.invoiceUrl);
  }
  if (payment.mock) {
    redirect(`/checkout/${created.bookingReference}`);
  }
  redirect(`/pay/${created.bookingReference}`);
}

export default async function BookPage({
  params,
  searchParams,
}: {
  params: Promise<{ legId: string }>;
  searchParams: Promise<{ passengers?: string; error?: string; outboundLegId?: string; returnLegId?: string }>;
}) {
  const { legId } = await params;
  const { passengers: passengersRaw, error, outboundLegId: outboundLegIdParam, returnLegId: returnLegIdParam } = await searchParams;
  const isRoundTrip = !!outboundLegIdParam && !!returnLegIdParam;
  const initialPassengers = Math.max(
    1,
    Math.min(10, Number(passengersRaw ?? 1) || 1),
  );

  const [leg, outboundLeg, returnLeg, session] = await Promise.all([
    !isRoundTrip ? prisma.leg.findUnique({
      where: { id: legId },
      include: {
        schedule: { include: { boat: true } },
      },
    }) : null,
    isRoundTrip ? prisma.leg.findUnique({
      where: { id: outboundLegIdParam! },
      include: {
        schedule: { include: { boat: true } },
      },
    }) : null,
    isRoundTrip ? prisma.leg.findUnique({
      where: { id: returnLegIdParam! },
      include: {
        schedule: { include: { boat: true } },
      },
    }) : null,
    getCustomerSession(),
  ]);

  if (!isRoundTrip && !leg) notFound();
  if (isRoundTrip && (!outboundLeg || !returnLeg)) notFound();

  const seasons = await loadActiveSeasons();
  const activeLegPricing = isRoundTrip
    ? legPricingInputs(outboundLeg!, seasons, 'OUTBOUND')
    : legPricingInputs(leg!, seasons);
  const returnLegPricing = isRoundTrip ? legPricingInputs(returnLeg!, seasons, 'RETURN') : null;

  // If logged in, pull the customer record for prefill.
  const customer = session
    ? await prisma.customer.findUnique({ where: { id: session.sub } })
    : null;

  // Validate leg(s) status
  if (isRoundTrip) {
    if (outboundLeg!.status !== 'OPEN' || activeLegPricing.closed || outboundLeg!.departureDate.getTime() <= Date.now()) {
      return (
        <div className="container py-12">
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              The outbound departure is no longer accepting bookings.
              <div className="mt-3">
                <Button asChild>
                  <Link href="/">Search another</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }
    if (returnLeg!.status !== 'OPEN' || returnLegPricing!.closed || returnLeg!.departureDate.getTime() <= Date.now()) {
      return (
        <div className="container py-12">
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              The return departure is no longer accepting bookings.
              <div className="mt-3">
                <Button asChild>
                  <Link href="/">Search another</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }
  } else {
    if (leg!.status !== 'OPEN' || activeLegPricing.closed || leg!.departureDate.getTime() <= Date.now()) {
      return (
        <div className="container py-12">
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              This departure is no longer accepting bookings.
              <div className="mt-3">
                <Button asChild>
                  <Link href="/">Search another</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }
  }

  // Same season-aware resolution the booking engine charges with.
  const activeLeg = isRoundTrip ? outboundLeg! : leg!;
  const pricing = await resolvePlatformPricing(activeLeg.operatorId);
  const priced = (inputs: ReturnType<typeof legPricingInputs>) => {
    const adult = Number(inputs.unitPrice);
    return {
      adult,
      child: inputs.categoryUnitPrices?.CHILD ?? adult * (pricing.multipliers?.CHILD ?? 0.5),
      infant: inputs.categoryUnitPrices?.INFANT ?? adult * (pricing.multipliers?.INFANT ?? 0),
    };
  };
  const outboundFare = priced(activeLegPricing);
  const returnFare = returnLegPricing ? priced(returnLegPricing) : { adult: 0, child: 0, infant: 0 };
  const unitPrice = outboundFare.adult;
  const returnUnitPrice = returnFare.adult;
  const totalUnitPrice = unitPrice + returnUnitPrice;
  const childPrice = outboundFare.child;
  const infantPrice = outboundFare.infant;
  const returnChildPrice = returnFare.child;
  const returnInfantPrice = returnFare.infant;

  // Total pricing for display (outbound + return for round-trip)
  const displayAdultPrice = totalUnitPrice;
  const displayChildPrice = childPrice + returnChildPrice;
  const displayInfantPrice = infantPrice + returnInfantPrice;

  const displayLeg = isRoundTrip ? outboundLeg! : leg!;
  const searchOrigin = displayLeg.schedule.originPort;
  const searchDestination = displayLeg.schedule.destinationPort;
  const roundTripReturnPrice = returnUnitPrice;
  const routeCandidate = `${searchOrigin}-${searchDestination}`.toUpperCase();
  const viewRoute = /^[A-Z0-9]{2,8}-[A-Z0-9]{2,8}$/.test(routeCandidate) ? routeCandidate : null;

  return (
    <div className="container py-8">
      <div className="mx-auto max-w-3xl">
        <BookingProgress currentStep={2} />
        <TrackEvent
          eventId={randomUUID()}
          name="view_item"
          requires="analytics"
          params={{
            currency: 'IDR',
            value: displayAdultPrice,
            items: [
              {
                item_id: `${searchOrigin}-${searchDestination}`.toUpperCase(),
                item_name: `${searchOrigin}-${searchDestination}`.toUpperCase(),
                item_category: isRoundTrip ? 'ROUND_TRIP' : 'ONE_WAY',
                price: displayAdultPrice,
              },
            ],
          }}
          collect={{
            route: viewRoute,
            leg_id: displayLeg.id,
            departure_date: formatLocalDate(displayLeg.departureDate, 'yyyy-MM-dd'),
            passenger_count: initialPassengers,
            trip_type: isRoundTrip ? 'ROUND_TRIP' : 'ONE_WAY',
            page_path: '/book',
          }}
        />
        <Link
          href={`/search?origin=${encodeURIComponent(searchOrigin)}&destination=${encodeURIComponent(searchDestination)}${isRoundTrip ? `&returnDate=${returnLeg!.departureDate.toISOString().split('T')[0]}` : ''}`}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Back to search
        </Link>

        <BookingPriceProvider
          adultPrice={displayAdultPrice}
          childPrice={displayChildPrice}
          infantPrice={displayInfantPrice}
          legFares={isRoundTrip ? { outbound: outboundFare, return: returnFare } : undefined}
          initialCount={initialPassengers}
          max={10}
        >
          {/* Outbound leg card */}
          <Card className="mt-3">
            <CardHeader>
              <CardTitle className="text-2xl">
                {displayLeg.schedule.originPort} → {displayLeg.schedule.destinationPort}
              </CardTitle>
              <CardDescription>
                {formatLocalDate(displayLeg.departureDate, 'EEEE, dd MMM yyyy')} ·{' '}
                <span className="font-mono">
                  {formatLocalTime(displayLeg.departureDate)}
                </span>{' '}
                WITA · {displayLeg.schedule.boat.name}
              </CardDescription>
            </CardHeader>
            <BookingPriceSummary />
          </Card>

          {/* Return leg card (if round-trip) */}
          {isRoundTrip && (
            <Card className="mt-3">
              <CardHeader>
                <CardTitle className="text-2xl">
                  {returnLeg!.schedule.originPort} → {returnLeg!.schedule.destinationPort}
                </CardTitle>
                <CardDescription>
                  {formatLocalDate(returnLeg!.departureDate, 'EEEE, dd MMM yyyy')} ·{' '}
                  <span className="font-mono">
                    {formatLocalTime(returnLeg!.departureDate)}
                  </span>{' '}
                  WITA · {returnLeg!.schedule.boat.name}
                </CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Return journey (same passengers apply to both legs)
              </CardContent>
            </Card>
          )}

          <form action={submitBookingAction} className="mt-6 space-y-6">
            {isRoundTrip ? (
              <>
                <input type="hidden" name="outboundLegId" value={outboundLegIdParam!} />
                <input type="hidden" name="returnLegId" value={returnLegIdParam!} />
              </>
            ) : (
              <input type="hidden" name="legId" value={leg!.id} />
            )}

            {error ? (
              <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            ) : null}

            {customer ? (
              <p className="rounded-md bg-sky-50 px-3 py-2 text-xs text-sky-900">
                Booking as <strong>{customer.fullName}</strong> ({customer.email}).
                This trip will appear in your{' '}
                <Link href="/account" className="underline">account</Link>.
              </p>
            ) : (
              <p className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-700">
                Booking as a guest.{' '}
                <Link
                  href={`/account/login?next=${encodeURIComponent(isRoundTrip ? `/book/0?outboundLegId=${outboundLegIdParam}&returnLegId=${returnLegIdParam}&passengers=${initialPassengers}` : `/book/${leg!.id}?passengers=${initialPassengers}`)}`}
                  className="font-medium text-sky-700 hover:underline"
                >
                  Sign in
                </Link>{' '}
                or{' '}
                <Link
                  href={`/account/register?next=${encodeURIComponent(isRoundTrip ? `/book/0?outboundLegId=${outboundLegIdParam}&returnLegId=${returnLegIdParam}&passengers=${initialPassengers}` : `/book/${leg!.id}?passengers=${initialPassengers}`)}`}
                  className="font-medium text-sky-700 hover:underline"
                >
                  create an account
                </Link>{' '}
                to save this trip and skip the form next time.
              </p>
            )}

            <Card>
              <CardHeader>
                <CardTitle>Passengers</CardTitle>
                <CardDescription>
                  Up to 10 per booking. Names should match a government ID
                  where possible.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <PassengerFields />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Contact details</CardTitle>
                <CardDescription>
                  We send your tickets and any updates here.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="customerName">Your name</Label>
                  <Input
                    id="customerName"
                    name="customerName"
                    required
                    minLength={NAMES_MIN}
                    autoComplete="name"
                    defaultValue={customer?.fullName ?? ''}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="customerEmail">Email</Label>
                  <Input
                    id="customerEmail"
                    name="customerEmail"
                    type="email"
                    required
                    autoComplete="email"
                    defaultValue={customer?.email ?? ''}
                  />
                </div>
                <ContactFields
                  defaultPhone={customer?.phoneNumber ?? ''}
                  defaultNationality={customer?.nationality ?? ''}
                />
                <div className="space-y-2">
                  <Label htmlFor="notes">Notes (optional)</Label>
                  <Textarea
                    id="notes"
                    name="notes"
                    rows={2}
                    placeholder="Anything the operator should know"
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Promo code</CardTitle>
                <CardDescription>
                  Have a discount code? Apply it here.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <PromoCodeInput />
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-3 pt-6">
                <label className="flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
                  <input
                    type="checkbox"
                    name="agreedToTerms"
                    value="1"
                    required
                    className="mt-0.5 h-4 w-4 flex-shrink-0"
                  />
                  <span>
                    I have read and agree to the{' '}
                    <Link
                      href="/terms"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-sky-700 underline"
                    >
                      Terms &amp; Conditions and Refund Policy
                    </Link>
                    . I confirm my booking details are correct and accept the
                    cancellation schedule (100% refund &gt;7 days · 50%
                    refund 48h–7 days · no refund &lt;48h before departure).
                  </span>
                </label>
              </CardContent>
              <CardFooter>
                <SubmitBookingButton />
              </CardFooter>
            </Card>
          </form>
        </BookingPriceProvider>
      </div>
    </div>
  );
}
