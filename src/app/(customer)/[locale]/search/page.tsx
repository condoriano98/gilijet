import { randomUUID } from 'node:crypto';
import { TrackEvent } from '@/features/marketing/components/track-event';
import Link from 'next/link';
import Image from 'next/image';
import { z } from 'zod';
import type { Prisma, SeasonType } from '@prisma/client';
import { prisma } from '@/shared/server/db';
import {
  formatLocalDate,
  formatLocalTime,
  localDateTimeToUtc,
  ymdInZone,
} from '@/shared/lib/datetime';
import { expireStalePendingBookings } from '@/features/booking/expiry';
import { Card, CardContent } from '@/shared/ui/card';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Logo } from '@/app/(customer)/_components/logo';
import { SearchForm } from '@/features/schedules/components/search-form';
import { SearchFilters } from '@/app/(customer)/[locale]/search/_components/search-filters';
import { BookingProgress } from '@/features/booking/components/booking-progress';
import { RoundTripLegSelector } from '@/app/(customer)/[locale]/search/_components/round-trip-leg-selector';
import { getMainLeg } from '@/features/booking/helpers';
import { serializeDecimals } from '@/shared/lib/serialize-decimals';
import { formatIDR } from '@/shared/lib/utils';
import { findConnections } from '@/features/schedules/connection-search';
import { getSeaCondition } from '@/features/ports/sea-conditions';
import { getCustomerSession } from '@/shared/server/auth';
import { getLatestRates, formatWithDisplay } from '@/features/pricing/fx';
import { getAvailablePorts } from '@/features/schedules/home-data';
import { loadActiveSeasons, withSeasonPrice } from '@/features/pricing/seasons';
import { MS_PER_DAY } from '@/shared/constants/time';
import { DEFAULT_LOOKAHEAD_DAYS } from '@/features/schedules/constants';

const querySchema = z.object({
  origin: z.string().min(2).optional(),
  destination: z.string().min(2),
  // Optional: a popular-route link only carries origin + destination. When
  // absent we default to today (WITA) so results show immediately.
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  returnDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  passengers: z.coerce.number().int().min(1).max(10).default(1),
  sortBy: z.enum(['time', 'price', 'duration']).default('time'),
  timeSlot: z.enum(['any', 'morning', 'afternoon', 'evening']).default('any'),
  maxPrice: z.coerce.number().int().positive().optional(),
});

const PAGE = 'mx-auto max-w-[1180px] px-5 py-6 sm:px-6 sm:py-8';
const PILL = 'rounded-full px-3 py-1 text-xs font-semibold';

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const raw = await searchParams;
  const parsed = querySchema.safeParse(raw);

  // Fallback ports so search renders even if the DB is unreachable.
  const SEED = [
    'Sanur', 'Padang Bai', 'Bangsal', 'Nusa Penida', 'Nusa Lembongan',
    'Gili Trawangan', 'Gili Air', 'Lombok', 'Labuan Bajo',
  ];
  let origins = SEED;
  let destinations = SEED;
  let portsByRegion: Awaited<ReturnType<typeof getAvailablePorts>> = [];

  try {
    portsByRegion = await getAvailablePorts();
    const ports = portsByRegion.flatMap(g => g.ports.map(p => p.name));
    if (ports.length > 0) {
      origins = Array.from(new Set([...SEED, ...ports])).sort();
      destinations = Array.from(new Set([...SEED, ...ports])).sort();
    }
  } catch (err) {
    console.error('[search] ports query failed:', err);
  }

  if (!parsed.success) {
    // The user landed here with incomplete params — usually from a destination
    // card that pre-fills only `destination`. Render the form with whatever
    // was provided and a friendly nudge, not a red error.
    const hasOrigin = Boolean(raw.origin);
    const hasDestination = Boolean(raw.destination);
    const nudge = !hasOrigin && hasDestination
      ? `Pick a departure port to see boats to ${raw.destination}.`
      : !hasDestination && hasOrigin
      ? `Pick a destination to see boats from ${raw.origin}.`
      : 'Pick a departure port and destination to see boats.';

    return (
      <div className={PAGE}>
        <BookingProgress currentStep={1} />
        <h1 className="mb-6 font-display text-3xl font-extrabold tracking-tight text-brand-ink">Find a boat</h1>
        <div className="rounded-[28px] bg-white shadow-ambient">
        <SearchForm
          origins={origins}
          destinations={destinations}
          portsByRegion={portsByRegion}
          defaultOrigin={raw.origin}
          defaultDestination={raw.destination}
        />
        </div>
        <p className="mt-4 text-sm text-brand-muted">{nudge}</p>
      </div>
    );
  }

  const { origin, destination, returnDate, passengers, sortBy, timeSlot, maxPrice } =
    parsed.data;
  const dateProvided = Boolean(parsed.data.date);
  const date = parsed.data.date ?? ymdInZone(new Date());
  const isRoundTrip = !!returnDate;
  // No origin = "any port" search from a destination card. Skip the sea
  // condition badge because route conditions are per-OD pair.
  const seaCondition = origin ? getSeaCondition(origin, destination) : null;

  // Lazy expiry sweep so freed seats show up in the next render. Don't
  // let a sweep failure block the page.
  try {
    await expireStalePendingBookings();
  } catch (err) {
    console.error('[search] expireStalePendingBookings failed:', err);
  }

  // When the user picks a date, search just that day (local 00:00 – 23:59 WITA).
  // When no date is given (e.g. landing from a "Popular routes" link), broaden
  // to the next 14 days so something always shows up instead of an empty page.
  const startUtc = dateProvided ? localDateTimeToUtc(date, '00:00') : new Date();
  const endUtc = dateProvided
    ? localDateTimeToUtc(date, '23:59')
    : new Date(Date.now() + DEFAULT_LOOKAHEAD_DAYS * MS_PER_DAY);

  type LegWithSchedule = Prisma.LegGetPayload<{
    include: { schedule: { include: { boat: { include: { operator: true } } } } };
  }> & { season: SeasonType | null };
  let legs: LegWithSchedule[] = [];
  let returnLegs: LegWithSchedule[] = [];
  let legsError = false;
  let legsErrorDetail: string | null = null;

  try {
    const seasons = await loadActiveSeasons();

    // Outbound legs: origin → destination
    const rawLegs = await prisma.leg.findMany({
      where: {
        departureDate: { gte: startUtc, lte: endUtc },
        status: { in: ['OPEN'] },
        schedule: {
          is: {
            ...(origin
              ? { originPort: { equals: origin, mode: 'insensitive' } }
              : {}),
            destinationPort: { equals: destination, mode: 'insensitive' },
            status: 'ACTIVE',
            deletedAt: null,
            boat: { deletedAt: null },
          },
        },
      },
      include: {
        schedule: { include: { boat: { include: { operator: true } } } },
      },
      orderBy: { departureDate: 'asc' },
      take: 50,
    });
    legs = withSeasonPrice(rawLegs, seasons, isRoundTrip ? 'OUTBOUND' : 'ONE_WAY');

    // Return legs: destination → origin (if round trip)
    if (isRoundTrip && origin) {
      const returnStartUtc = localDateTimeToUtc(returnDate, '00:00');
      const returnEndUtc = localDateTimeToUtc(returnDate, '23:59');
      const rawReturnLegs = await prisma.leg.findMany({
        where: {
          departureDate: { gte: returnStartUtc, lte: returnEndUtc },
          status: { in: ['OPEN'] },
          schedule: {
            is: {
              originPort: { equals: destination, mode: 'insensitive' },
              destinationPort: { equals: origin, mode: 'insensitive' },
              status: 'ACTIVE',
              deletedAt: null,
              boat: { deletedAt: null },
            },
          },
        },
        include: {
          schedule: { include: { boat: { include: { operator: true } } } },
        },
        orderBy: { departureDate: 'asc' },
        take: 50,
      });
      returnLegs = withSeasonPrice(rawReturnLegs, seasons, 'RETURN');
    }
  } catch (err) {
    console.error('[search] legs query failed:', err);
    legsError = true;
    // Surface enough detail for ops to diagnose schema drift, pool exhaustion,
    // or unknown columns without leaking secrets. Prisma errors include `code`
    // (e.g. P2022 = unknown column) and a single-line `message`.
    const e = err as { code?: string; message?: string };
    legsErrorDetail = e?.code ? `${e.code}: ${e.message ?? 'unknown'}` : (e?.message ?? null);
  }

  // Helper: apply filters and sorting to a leg list
  const applyFiltersAndSort = (legList: LegWithSchedule[]): LegWithSchedule[] => {
    let result = legList;

    // Apply time-slot filter
    if (timeSlot !== 'any') {
      result = result.filter((leg) => {
        const hour = Number(formatLocalTime(leg.departureDate).split(':')[0]);
        if (timeSlot === 'morning') return hour >= 6 && hour < 12;
        if (timeSlot === 'afternoon') return hour >= 12 && hour < 17;
        return hour >= 17 || hour < 6; // evening (incl. very early morning)
      });
    }

    // Apply max-price filter
    if (maxPrice && maxPrice > 0) {
      result = result.filter(
        (leg) => Number(leg.basePrice) <= maxPrice,
      );
    }

    // Apply sort
    result.sort((a, b) => {
      if (sortBy === 'price') {
        return Number(a.basePrice) - Number(b.basePrice);
      }
      if (sortBy === 'duration') {
        return a.schedule.durationMinutes - b.schedule.durationMinutes;
      }
      return a.departureDate.getTime() - b.departureDate.getTime();
    });

    return result;
  };

  let visibleLegs = applyFiltersAndSort(legs);
  let visibleReturnLegs = isRoundTrip ? applyFiltersAndSort(returnLegs) : [];

  // Batch-fetch review aggregates for displayed schedules
  // For round-trip, include schedule IDs from both outbound and return legs
  const allVisibleLegs = isRoundTrip ? [...visibleLegs, ...visibleReturnLegs] : visibleLegs;
  const scheduleIds = Array.from(
    new Set(allVisibleLegs.map((l) => l.scheduleId)),
  );
  let ratingsByScheduleId: Map<
    string,
    { avg: number; count: number }
  > = new Map();
  if (scheduleIds.length > 0) {
    try {
      const ratings = await prisma.review.groupBy({
        by: ['scheduleId'],
        where: { scheduleId: { in: scheduleIds } },
        _avg: { rating: true },
        _count: { rating: true },
      });
      ratingsByScheduleId = new Map(
        ratings.map((r) => [
          r.scheduleId,
          { avg: Number(r._avg.rating ?? 0), count: r._count.rating },
        ]),
      );
    } catch (err) {
      console.error('[search] review aggregates failed:', err);
    }
  }

  // Connection search (only when no direct legs found, or always show as alternative).
  // Skip when origin is missing — a connection without a specific starting port
  // would explode into a cross-product of every operator's network.
  let connections: Awaited<ReturnType<typeof findConnections>> = [];
  if (!legsError && origin) {
    try {
      connections = await findConnections(origin, destination, startUtc, endUtc);
    } catch (err) {
      console.error('[search] connection search failed:', err);
    }
  }

  // Travel Again: check if logged-in customer has booked this route before
  const customerSession = await getCustomerSession();
  let travelAgainRoutes = new Set<string>();
  // TODO: Fix type mismatch after round-trip changes
  // if (customerSession) {
  //   try { ... }
  // }

  const fxRates = await getLatestRates();
  const routeCode = origin ? `${origin}-${destination}`.toUpperCase() : null;
  const trackableRoute = routeCode && /^[A-Z0-9]{2,8}-[A-Z0-9]{2,8}$/.test(routeCode) ? routeCode : undefined;

  return (
    <div className={PAGE}>
      <BookingProgress currentStep={1} />
      {!legsError ? (
        <TrackEvent
          eventId={randomUUID()}
          name="search"
          requires="analytics"
          params={{
            search_term: trackableRoute ?? destination,
            route: trackableRoute ?? null,
            departure_date: date,
            passengers: passengers ?? 1,
            trip_type: isRoundTrip ? 'ROUND_TRIP' : 'ONE_WAY',
            results: legs.length,
          }}
          collect={{
            route: trackableRoute ?? null,
            departure_date: date,
            passenger_count: passengers ?? 1,
            trip_type: isRoundTrip ? 'ROUND_TRIP' : 'ONE_WAY',
            page_path: '/search',
          }}
        />
      ) : null}

      {/* Listing hero: the search card floats over its lower edge. */}
      <div className="relative mt-4 overflow-hidden rounded-[32px] px-6 pb-28 pt-10 sm:px-12 sm:pb-32">
        <Image
          src="/brand/hero-home.png"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-[25%_60%] sm:object-[center_60%]"
        />
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(0,34,142,0.78)_0%,rgba(0,34,142,0.62)_55%,rgba(0,34,142,0.1)_100%)]" />
        <div className="relative text-white">
          <p className="text-sm font-semibold text-brand-periwinkle">
            Let Journey Begin with Gilifast!
          </p>
          <h1 className="mt-2 max-w-2xl font-display text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">
            Find the best deals on boats for your trip
          </h1>
        </div>
      </div>
      <div className="relative z-10 -mt-20 mb-10 rounded-[28px] bg-white shadow-ambient sm:-mt-16">
        <SearchForm
          origins={origins}
          destinations={destinations}
          portsByRegion={portsByRegion}
          defaultOrigin={origin}
          defaultDestination={destination}
          defaultDate={date}
          defaultReturnDate={returnDate}
          defaultPassengers={passengers}
          defaultTripType={returnDate ? 'round_trip' : 'one_way'}
        />
      </div>

      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-display text-2xl font-extrabold tracking-tight text-brand-ink sm:text-[28px]">
            {origin ? `${origin} → ${destination}` : `Boats to ${destination}`}
          </h2>
          {seaCondition ? (
            <Badge variant={seaCondition.tone}>{seaCondition.label}</Badge>
          ) : null}
        </div>
        <p className="text-sm text-brand-muted">
          {dateProvided
            ? formatLocalDate(startUtc, 'EEEE, dd MMM yyyy')
            : 'Upcoming departures · next 14 days'}{' '}
          · {passengers} passenger{passengers === 1 ? '' : 's'}
          {returnDate ? (
            <>
              {' '}· returning {formatLocalDate(localDateTimeToUtc(returnDate, '00:00'), 'dd MMM')}
            </>
          ) : null}
        </p>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
        {!legsError && legs.length > 0 ? (
          <aside aria-label="Filters" className="lg:w-[280px] lg:shrink-0">
            <SearchFilters
              sortBy={sortBy}
              timeSlot={timeSlot}
              maxPrice={maxPrice ?? null}
            />
          </aside>
        ) : null}

        <div className="min-w-0 flex-1">
      {legsError ? (
        <Card className="rounded-3xl border-brand-line shadow-none">
          <CardContent className="py-12 text-center text-sm text-brand-muted">
            We&apos;re having trouble loading departures right now. Please try
            again in a moment.
            {legsErrorDetail ? (
              <div className="mt-3 inline-block rounded bg-brand-surface px-2 py-1 font-mono text-xs text-brand-muted">
                {legsErrorDetail}
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : isRoundTrip && visibleLegs.length > 0 ? (
        // Round-trip: show leg selector (serialize Decimals for client component)
        <RoundTripLegSelector
          outboundLegs={serializeDecimals(visibleLegs)}
          returnLegs={serializeDecimals(visibleReturnLegs)}
          passengers={passengers}
          ratingsByScheduleId={Object.fromEntries(ratingsByScheduleId)}
          fxRates={fxRates}
        />
      ) : legs.length === 0 ? (
        <Card className="rounded-3xl border-brand-line shadow-none">
          <CardContent className="py-12 text-center text-sm text-brand-muted">
            {dateProvided
              ? 'No departures on this date. Try a different day.'
              : 'No upcoming departures for this route in the next 14 days.'}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {visibleLegs.length === 0 ? (
            <Card className="rounded-3xl border-brand-line shadow-none">
              <CardContent className="py-12 text-center text-sm text-brand-muted">
                No departures match your filters. Try widening the time or price
                range.
              </CardContent>
            </Card>
          ) : null}
          {visibleLegs.map((leg) => {
            const rating = ratingsByScheduleId.get(leg.scheduleId);
            const travelAgainKey = `${leg.schedule.originPort}|${leg.schedule.destinationPort}|${leg.operatorId}`;
            const showTravelAgain = travelAgainRoutes.has(travelAgainKey);
            const priceIdr = Number(leg.basePrice);
            const fxDisplay = formatWithDisplay(priceIdr, 'USD', fxRates);
            return (
              <article
                key={leg.id}
                className="flex flex-col gap-4 rounded-[22px] border border-brand-line bg-white p-4 shadow-ambient-sm sm:flex-row sm:gap-5 sm:p-[18px]"
              >
                <div className="relative hidden h-auto w-40 shrink-0 overflow-hidden rounded-2xl bg-brand-periwinkle sm:flex sm:items-center sm:justify-center">
                  {leg.schedule.boat.photos.length > 0 ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={leg.schedule.boat.photos[0]}
                      alt={leg.schedule.boat.name}
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  ) : (
                    <Logo className="text-brand opacity-60" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-3">
                    <span className="text-[28px] font-extrabold leading-tight tracking-tight tabular-nums text-brand-ink">
                      {formatLocalTime(leg.departureDate)}
                    </span>
                    {!dateProvided ? (
                      <span className="text-sm font-medium text-brand-muted">
                        {formatLocalDate(leg.departureDate, 'EEE dd MMM')}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1.5 text-sm text-brand-muted">
                    {!origin ? (
                      <>
                        <span className="font-medium text-brand-ink">
                          from {leg.schedule.originPort}
                        </span>{' '}·{' '}
                      </>
                    ) : null}
                    {leg.schedule.boat.name} · {leg.schedule.durationMinutes} min
                    {rating && rating.count > 0 ? (
                      <>
                        {' '}· <span className="font-bold text-amber-700">★ {rating.avg.toFixed(1)}</span>{' '}
                        <span>
                          ({rating.count} review{rating.count === 1 ? '' : 's'})
                        </span>
                      </>
                    ) : null}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className={`${PILL} bg-emerald-50 text-emerald-800`}>
                      Direct · {leg.schedule.durationMinutes}m
                    </span>
                    {leg.season === 'HIGH' || leg.season === 'PEAK' ? (
                      <span className={`${PILL} bg-amber-100 text-amber-900`}>
                        {leg.season === 'PEAK' ? 'Peak season' : 'High season'}
                      </span>
                    ) : null}
                    <span className={`${PILL} bg-brand-periwinkle text-brand-dark`}>
                      {leg.schedule.boat.category}
                    </span>
                    <span className={`${PILL} border border-brand-line text-brand-text`}>
                      {leg.schedule.boat.operator.companyName}
                    </span>
                    {showTravelAgain ? (
                      <span className={`${PILL} border border-brand text-brand`}>
                        Travel Again
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="flex flex-col justify-between gap-4 border-t border-brand-line pt-4 sm:w-52 sm:items-end sm:border-t-0 sm:pt-0 sm:text-right">
                  <div>
                    <div className="text-2xl font-extrabold tracking-tight text-brand">
                      {fxDisplay.primary}
                    </div>
                    {fxDisplay.secondary ? (
                      <div className="text-xs text-brand-muted">{fxDisplay.secondary}</div>
                    ) : null}
                    <div className="text-[13px] text-brand-muted">per passenger</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2 sm:flex-col sm:items-end">
                    <Link
                      href="/best-price-guarantee"
                      className="text-xs text-brand-muted underline hover:text-brand"
                      title="Best Price Guarantee"
                    >
                      Best Price ✓
                    </Link>
                    <Button asChild className="h-12 w-full rounded-[14px] bg-brand px-5 text-[15px] font-bold text-white hover:bg-brand-dark sm:w-auto">
                      <Link href={`/book/${leg.id}?passengers=${passengers}`}>
                        Book {passengers} ·{' '}
                        {formatIDR(Number(leg.basePrice) * passengers)}
                      </Link>
                    </Button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Connection results */}
      {!legsError && connections.length > 0 && (
        <div className="mt-10">
          <h2 className="mb-4 font-display text-xl font-extrabold tracking-tight text-brand-ink">
            Via connections
          </h2>
          <div className="space-y-4">
            {connections.map((conn) => (
              <article
                key={`${conn.leg1.id}-${conn.leg2.id}`}
                className="flex flex-wrap items-center justify-between gap-5 rounded-[22px] border-[1.5px] border-dashed border-brand/40 bg-brand-surface/60 p-5"
              >
                <div>
                  <div className="text-xl font-extrabold tabular-nums text-brand-ink">
                    {formatLocalTime(conn.leg1.departureDate)}{' '}
                    <span className="text-sm font-medium text-brand-muted">
                      → {conn.transferPort} →
                    </span>{' '}
                    {formatLocalTime(conn.leg2.departureDate)}
                  </div>
                  <div className="mt-1 text-sm text-brand-muted">
                    Transfer at {conn.transferPort} · {conn.transferWaitMinutes} min wait ·{' '}
                    ~{Math.round(conn.totalDurationMinutes / 60)}h{' '}
                    {conn.totalDurationMinutes % 60}m total
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className={`${PILL} bg-amber-100 text-amber-900`}>
                      Transit · via {conn.transferPort}
                    </span>
                    <span className="text-xs text-brand-muted">
                      {conn.leg1.schedule.boat.name} + {conn.leg2.schedule.boat.name}
                    </span>
                  </div>
                </div>
                <div className="sm:text-right">
                  <div className="text-xl font-extrabold text-brand">
                    {formatIDR(conn.totalPrice * passengers)}
                  </div>
                  <div className="text-[13px] text-brand-muted">
                    {formatIDR(conn.totalPrice)} per pax · 2 legs
                  </div>
                  <div className="mt-3 flex items-center gap-3 sm:justify-end">
                    <Link
                      href="/best-price-guarantee"
                      className="text-xs text-brand-muted underline hover:text-brand"
                      title="Best Price Guarantee"
                    >
                      Best Price ✓
                    </Link>
                    <Button asChild variant="outline" className="h-11 rounded-[14px] border-[1.5px] border-brand px-5 font-bold text-brand hover:bg-brand-periwinkle">
                      <Link href={`/book/${conn.leg1.id}?passengers=${passengers}`}>
                        Book leg 1 first
                      </Link>
                    </Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      )}
        </div>
      </div>
    </div>
  );
}
