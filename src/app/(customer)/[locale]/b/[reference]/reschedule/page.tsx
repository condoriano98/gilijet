import { loadActiveSeasons, withSeasonPrice, legPricingInputs } from '@/features/pricing/seasons';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { z } from 'zod';
import { prisma } from '@/shared/server/db';
import { audit } from '@/shared/server/audit';
import { formatLocalDate, formatLocalTime, localDateTimeToUtc } from '@/shared/lib/datetime';
import { formatIDR } from '@/shared/lib/utils';
import { getMainLeg } from '@/features/booking/helpers';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { MS_PER_DAY } from '@/shared/constants/time';

export const metadata = { title: 'Request date change' };

const submitSchema = z.object({
  reference: z.string().min(1),
  requestedLegId: z.string().min(1),
  customerNote: z.string().max(500).optional().or(z.literal('')),
  confirmEmail: z.string().email(),
});

async function submitRescheduleAction(formData: FormData) {
  'use server';
  const parsed = submitSchema.safeParse({
    reference: formData.get('reference'),
    requestedLegId: formData.get('requestedLegId'),
    // The form has no note field, so this is null, which the schema rejects.
    customerNote: formData.get('customerNote') ?? undefined,
    confirmEmail: formData.get('confirmEmail'),
  });
  if (!parsed.success) {
    redirect(
      `/b/${formData.get('reference')}/reschedule?error=${encodeURIComponent(parsed.error.issues[0].message)}`,
    );
  }

  const booking = await prisma.booking.findUnique({
    where: { bookingReference: parsed.data.reference },
    include: { leg: true, outboundLeg: true, returnLeg: true, rescheduleRequest: true },
  });
  if (!booking) redirect('/b?error=missing');
  if (
    booking.customerEmail.toLowerCase() !==
    parsed.data.confirmEmail.toLowerCase()
  ) {
    redirect(
      `/b/${parsed.data.reference}/reschedule?error=${encodeURIComponent('Email does not match booking')}`,
    );
  }
  if (booking.status !== 'CONFIRMED') {
    redirect(
      `/b/${parsed.data.reference}?error=${encodeURIComponent('Only confirmed bookings can be rescheduled')}`,
    );
  }
  if (!booking.legId) {
    redirect(
      `/b/${parsed.data.reference}?error=${encodeURIComponent('Round-trip bookings cannot be rescheduled yet')}`,
    );
  }
  const mainLeg = getMainLeg(booking)!;
  if (mainLeg.departureDate.getTime() <= Date.now()) {
    redirect(
      `/b/${parsed.data.reference}?error=${encodeURIComponent('Departure has already passed')}`,
    );
  }
  if (
    booking.rescheduleRequest &&
    booking.rescheduleRequest.status === 'PENDING'
  ) {
    redirect(
      `/b/${parsed.data.reference}?error=${encodeURIComponent('A reschedule request is already pending')}`,
    );
  }
  if (parsed.data.requestedLegId === booking.legId) {
    redirect(
      `/b/${parsed.data.reference}/reschedule?error=${encodeURIComponent('Pick a different departure')}`,
    );
  }

  // Validate target leg matches the same route and is open
  const [target, original] = await Promise.all([
    prisma.leg.findUnique({
      where: { id: parsed.data.requestedLegId },
      include: { schedule: true },
    }),
    prisma.leg.findUnique({
      where: { id: booking.legId },
      include: { schedule: true },
    }),
  ]);
  if (
    !target ||
    !original ||
    target.status !== 'OPEN' ||
    legPricingInputs(target, await loadActiveSeasons()).closed ||
    target.schedule.originPort !== original.schedule.originPort ||
    target.schedule.destinationPort !== original.schedule.destinationPort
  ) {
    redirect(
      `/b/${parsed.data.reference}/reschedule?error=${encodeURIComponent('Selected departure is unavailable')}`,
    );
  }

  // Upsert the request (replaces an old non-pending one if present)
  await prisma.rescheduleRequest.upsert({
    where: { bookingId: booking.id },
    create: {
      bookingId: booking.id,
      originalLegId: booking.legId,
      requestedLegId: parsed.data.requestedLegId,
      customerNote: parsed.data.customerNote?.trim() || null,
      status: 'PENDING',
    },
    update: {
      requestedLegId: parsed.data.requestedLegId,
      customerNote: parsed.data.customerNote?.trim() || null,
      status: 'PENDING',
      processedBy: null,
      processedAt: null,
      adminNote: null,
    },
  });

  await audit({
    entityType: 'BOOKING',
    entityId: booking.id,
    action: 'reschedule_requested',
    userRole: 'CUSTOMER',
    newState: {
      originalLegId: booking.legId,
      requestedLegId: parsed.data.requestedLegId,
    },
  });

  redirect(`/b/${parsed.data.reference}?ok=reschedule_requested`);
}

export default async function ReschedulePage({
  params,
  searchParams,
}: {
  params: Promise<{ reference: string }>;
  searchParams: Promise<{ date?: string; error?: string }>;
}) {
  const { reference } = await params;
  const { date, error } = await searchParams;

  const booking = await prisma.booking.findUnique({
    where: { bookingReference: reference },
    include: {
      leg: { include: { schedule: { include: { boat: true } } } },
      outboundLeg: { include: { schedule: { include: { boat: true } } } },
      returnLeg: { include: { schedule: { include: { boat: true } } } },
      rescheduleRequest: true,
    },
  });
  if (!booking) notFound();
  if (booking.status !== 'CONFIRMED') {
    redirect(`/b/${reference}`);
  }
  if (!booking.legId) {
    redirect(`/b/${reference}`);
  }

  const mainLeg = getMainLeg(booking)!;

  const seatCount = Math.max(
    1,
    booking.notes
      ? (() => {
          try {
            const parsed = JSON.parse(booking.notes) as { passengers?: Array<{ type?: string }> };
            return Array.isArray(parsed.passengers)
              ? parsed.passengers.filter((p) => p.type !== 'INFANT').length
              : 1;
          } catch {
            return 1;
          }
        })()
      : 1,
  );

  // Default to a week from now, or the user-picked date
  const today = new Date();
  const defaultDate =
    date ?? new Date(today.getTime() + 7 * MS_PER_DAY).toISOString().slice(0, 10);
  const startUtc = localDateTimeToUtc(defaultDate, '00:00');
  const endUtc = localDateTimeToUtc(defaultDate, '23:59');

  const rawCandidateLegs = await prisma.leg.findMany({
    where: {
      status: 'OPEN',
      departureDate: { gte: startUtc, lte: endUtc },
      schedule: {
        originPort: mainLeg.schedule.originPort,
        destinationPort: mainLeg.schedule.destinationPort,
        status: 'ACTIVE',
        deletedAt: null,
        boat: { deletedAt: null },
      },
      NOT: { id: booking.legId },
    },
    include: { schedule: { include: { boat: true } } },
    orderBy: { departureDate: 'asc' },
  });
  const candidateLegs = withSeasonPrice(rawCandidateLegs, await loadActiveSeasons()).slice(0, 20);

  return (
    <div className="mx-auto max-w-[860px] px-5 py-6 sm:px-6 sm:py-8">
      <div className="space-y-5">
        <Link
          href={`/b/${reference}`}
          className="inline-flex min-h-11 items-center text-sm font-semibold text-brand hover:underline"
        >
          ← Back to booking
        </Link>

        <section className="rounded-3xl border border-brand-line bg-white p-5 sm:p-7">
          <h1 className="font-display text-3xl font-extrabold tracking-tight text-brand-ink sm:text-[30px]">
            Request a date change
          </h1>
          <p className="mt-2 text-[15px] leading-relaxed text-brand-muted">
            Currently on{' '}
            <strong className="text-brand-ink">
              {formatLocalDate(mainLeg.departureDate, 'EEE, dd MMM yyyy')} ·{' '}
              {formatLocalTime(mainLeg.departureDate)}
            </strong>
            . Pick a new departure on the same route — operators usually
            approve within a few hours.
          </p>
          <form className="mt-5 flex flex-wrap items-end gap-3" action="">
            <input type="hidden" name="reference" value={reference} />
            <div className="space-y-1.5">
              <Label htmlFor="date" className="text-[13px] font-semibold text-brand-ink">
                Choose a new date
              </Label>
              <Input
                id="date"
                name="date"
                type="date"
                defaultValue={defaultDate}
                min={new Date().toISOString().slice(0, 10)}
                className="h-12 rounded-[14px] border-brand-line px-3.5 text-base"
              />
            </div>
            <Button
              type="submit"
              variant="outline"
              className="h-12 rounded-[14px] border-[1.5px] border-brand px-6 text-[15px] font-bold text-brand hover:bg-brand-periwinkle"
            >
              Show departures
            </Button>
          </form>
        </section>

        {error ? (
          <p className="rounded-2xl bg-red-50 px-[18px] py-3.5 text-sm text-red-700">
            {error}
          </p>
        ) : null}
        {booking.rescheduleRequest?.status === 'PENDING' ? (
          <p className="rounded-2xl bg-amber-100 px-[18px] py-3.5 text-sm text-amber-900">
            You already have a pending reschedule request. Submitting a new one
            will replace it.
          </p>
        ) : null}

        {candidateLegs.length === 0 ? (
          <p className="rounded-2xl border-[1.5px] border-dashed border-brand-line p-5 text-center text-sm text-brand-muted sm:p-6">
            No departures on this date. Try another date.
          </p>
        ) : (
          <section className="rounded-3xl border border-brand-line bg-white p-5 sm:p-7">
            <h2 className="font-display text-xl font-extrabold tracking-tight text-brand-ink">
              {mainLeg.schedule.originPort} →{' '}
              {mainLeg.schedule.destinationPort}
            </h2>
            <p className="mt-1 text-sm text-brand-muted">
              {formatLocalDate(startUtc, 'EEEE, dd MMM yyyy')} · {seatCount}{' '}
              passenger{seatCount === 1 ? '' : 's'}
            </p>
            <div className="mt-4 space-y-3">
              {candidateLegs.map((leg) => (
                <form
                  key={leg.id}
                  action={submitRescheduleAction}
                  className="flex flex-col gap-4 rounded-[18px] border border-brand-line bg-white p-4 sm:flex-row sm:items-center sm:justify-between sm:px-[18px]"
                >
                  <input type="hidden" name="reference" value={reference} />
                  <input
                    type="hidden"
                    name="requestedLegId"
                    value={leg.id}
                  />
                  <div>
                    <div className="text-xl font-extrabold text-brand-ink">
                      {formatLocalTime(leg.departureDate)}{' '}
                      <span className="text-[13px] font-semibold text-brand-muted">WITA</span>
                    </div>
                    <div className="text-[13px] text-brand-muted">
                      {leg.schedule.boat.name} ·{' '}
                      {leg.schedule.durationMinutes} min ·{' '}
                      {formatIDR(Number(leg.basePrice))}/pax
                    </div>
                  </div>
                  <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
                    <Input
                      type="email"
                      name="confirmEmail"
                      placeholder="Confirm email"
                      required
                      className="h-12 w-full rounded-[14px] border-brand-line px-3.5 text-[15px] sm:w-56"
                    />
                    <Button
                      type="submit"
                      className="h-12 rounded-[14px] bg-brand px-[22px] text-[15px] font-bold text-white hover:bg-brand-dark"
                    >
                      Request this
                    </Button>
                  </div>
                </form>
              ))}
            </div>
          </section>
        )}

        <p className="text-[13px] text-brand-muted">
          Need to add a note for the operator? Send your reasons by WhatsApp
          after submitting — references your booking by code.
        </p>
      </div>
    </div>
  );
}
