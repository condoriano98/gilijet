import Link from "next/link";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  formatLocalDate,
  formatLocalTime,
  localDateTimeToUtc,
  ymdInZone,
} from "@/lib/datetime";
import { expireStalePendingBookings } from "@/lib/booking-expiry";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SearchForm } from "@/components/customer/search-form";
import { SearchFilters } from "@/components/customer/search-filters";
import { BookingProgress } from "@/components/customer/booking-progress";
import { formatIDR } from "@/lib/utils";
import { findConnections } from "@/lib/connection-search";
import { parsePricingTiers, computeYieldAdjustedPrice } from "@/lib/pricing";
import { getSeaCondition } from "@/lib/sea-conditions";
import { seatUrgency } from "@/lib/seat-urgency";
import { getCustomerSession } from "@/lib/auth";
import { getLatestRates, formatWithDisplay } from "@/lib/fx";

const querySchema = z.object({
  origin: z.string().min(2).optional(),
  destination: z.string().min(2),
  // Optional: a popular-route link only carries origin + destination. When
  // absent we default to today (WITA) so results show immediately.
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  returnDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  passengers: z.coerce.number().int().min(1).max(10).default(1),
  sortBy: z.enum(["time", "price", "duration"]).default("time"),
  timeSlot: z.enum(["any", "morning", "afternoon", "evening"]).default("any"),
  maxPrice: z.coerce.number().int().positive().optional(),
});

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const raw = await searchParams;
  const parsed = querySchema.safeParse(raw);

  // Fallback ports so search renders even if the DB is unreachable.
  const SEED = [
    "Sanur", "Padang Bai", "Bangsal", "Nusa Penida", "Nusa Lembongan",
    "Gili Trawangan", "Gili Air", "Lombok", "Labuan Bajo",
  ];
  let origins = SEED;
  let destinations = SEED;
  try {
    const schedules = await prisma.schedule.findMany({
      where: { status: "ACTIVE", deletedAt: null, boat: { status: "ACTIVE", deletedAt: null } },
      select: { originPort: true, destinationPort: true },
    });
    if (schedules.length > 0) {
      origins = Array.from(
        new Set([...SEED, ...schedules.map((s) => s.originPort)]),
      ).sort();
      destinations = Array.from(
        new Set([...SEED, ...schedules.map((s) => s.destinationPort)]),
      ).sort();
    }
  } catch (err) {
    console.error("[search] schedules query failed:", err);
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
      : "Pick a departure port and destination to see boats.";

    return (
      <div className="container py-8">
        <BookingProgress currentStep={1} />
        <h1 className="mb-6 text-2xl font-bold tracking-tight">Find a boat</h1>
        <SearchForm
          origins={origins}
          destinations={destinations}
          defaultOrigin={raw.origin}
          defaultDestination={raw.destination}
        />
        <p className="mt-4 text-sm text-slate-600">{nudge}</p>
      </div>
    );
  }

  const { origin, destination, returnDate, passengers, sortBy, timeSlot, maxPrice } =
    parsed.data;
  const dateProvided = Boolean(parsed.data.date);
  const date = parsed.data.date ?? ymdInZone(new Date());
  // No origin = "any port" search from a destination card. Skip the sea
  // condition badge because route conditions are per-OD pair.
  const seaCondition = origin ? getSeaCondition(origin, destination) : null;

  // Lazy expiry sweep so freed seats show up in the next render. Don't
  // let a sweep failure block the page.
  try {
    await expireStalePendingBookings();
  } catch (err) {
    console.error("[search] expireStalePendingBookings failed:", err);
  }

  // When the user picks a date, search just that day (local 00:00 – 23:59 WITA).
  // When no date is given (e.g. landing from a "Popular routes" link), broaden
  // to the next 14 days so something always shows up instead of an empty page.
  const startUtc = dateProvided ? localDateTimeToUtc(date, "00:00") : new Date();
  const endUtc = dateProvided
    ? localDateTimeToUtc(date, "23:59")
    : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

  type LegWithSchedule = Prisma.LegGetPayload<{
    include: { schedule: { include: { boat: true } } };
  }>;
  let legs: LegWithSchedule[] = [];
  let legsError = false;
  let legsErrorDetail: string | null = null;
  try {
    legs = await prisma.leg.findMany({
      where: {
        departureDate: { gte: startUtc, lte: endUtc },
        status: { in: ["OPEN"] },
        availableSeats: { gte: passengers },
        schedule: {
          is: {
            ...(origin
              ? { originPort: { equals: origin, mode: "insensitive" } }
              : {}),
            destinationPort: { equals: destination, mode: "insensitive" },
            status: "ACTIVE",
            deletedAt: null,
            boat: { deletedAt: null },
          },
        },
      },
      include: {
        schedule: { include: { boat: true } },
      },
      orderBy: { departureDate: "asc" },
      take: 50,
    });
  } catch (err) {
    console.error("[search] legs query failed:", err);
    legsError = true;
    // Surface enough detail for ops to diagnose schema drift, pool exhaustion,
    // or unknown columns without leaking secrets. Prisma errors include `code`
    // (e.g. P2022 = unknown column) and a single-line `message`.
    const e = err as { code?: string; message?: string };
    legsErrorDetail = e?.code ? `${e.code}: ${e.message ?? "unknown"}` : (e?.message ?? null);
  }

  // Apply yield-adjusted pricing to each leg
  let legsWithAdjustedPricing = legs.map((leg) => {
    const tiers = parsePricingTiers((leg.schedule as { pricingTiers?: unknown }).pricingTiers);
    const adjustedPrice = computeYieldAdjustedPrice({
      basePrice: leg.basePrice,
      totalCapacity: leg.totalCapacity,
      availableSeats: leg.availableSeats,
      tiers,
    });
    const isPriceSurged = adjustedPrice.greaterThan(leg.basePrice);
    return { ...leg, adjustedPrice, isPriceSurged };
  });

  // Apply time-slot filter
  if (timeSlot !== "any") {
    legsWithAdjustedPricing = legsWithAdjustedPricing.filter((leg) => {
      const hour = Number(formatLocalTime(leg.departureDate).split(":")[0]);
      if (timeSlot === "morning") return hour >= 6 && hour < 12;
      if (timeSlot === "afternoon") return hour >= 12 && hour < 17;
      return hour >= 17 || hour < 6; // evening (incl. very early morning)
    });
  }

  // Apply max-price filter
  if (maxPrice && maxPrice > 0) {
    legsWithAdjustedPricing = legsWithAdjustedPricing.filter(
      (leg) => Number(leg.adjustedPrice) <= maxPrice,
    );
  }

  // Apply sort
  legsWithAdjustedPricing.sort((a, b) => {
    if (sortBy === "price") {
      return Number(a.adjustedPrice) - Number(b.adjustedPrice);
    }
    if (sortBy === "duration") {
      return a.schedule.durationMinutes - b.schedule.durationMinutes;
    }
    return a.departureDate.getTime() - b.departureDate.getTime();
  });

  // Batch-fetch review aggregates for displayed schedules
  const scheduleIds = Array.from(
    new Set(legsWithAdjustedPricing.map((l) => l.scheduleId)),
  );
  let ratingsByScheduleId: Map<
    string,
    { avg: number; count: number }
  > = new Map();
  if (scheduleIds.length > 0) {
    try {
      const ratings = await prisma.review.groupBy({
        by: ["scheduleId"],
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
      console.error("[search] review aggregates failed:", err);
    }
  }

  // Connection search (only when no direct legs found, or always show as alternative).
  // Skip when origin is missing — a connection without a specific starting port
  // would explode into a cross-product of every operator's network.
  let connections: Awaited<ReturnType<typeof findConnections>> = [];
  if (!legsError && origin) {
    try {
      connections = await findConnections(origin, destination, startUtc, endUtc, passengers);
    } catch (err) {
      console.error("[search] connection search failed:", err);
    }
  }

  // Travel Again: check if logged-in customer has booked this route before
  const customerSession = await getCustomerSession();
  let travelAgainRoutes = new Set<string>();
  if (customerSession) {
    try {
      const pastBookings = await prisma.booking.findMany({
        where: {
          customerId: customerSession.sub,
          status: "CONFIRMED",
        },
        select: {
          leg: {
            select: {
              schedule: {
                select: {
                  originPort: true,
                  destinationPort: true,
                  boat: { select: { operatorId: true } },
                },
              },
            },
          },
        },
        take: 50,
      });
      for (const b of pastBookings) {
        const key = `${b.leg.schedule.originPort}|${b.leg.schedule.destinationPort}|${b.leg.schedule.boat.operatorId}`;
        travelAgainRoutes.add(key);
      }
    } catch (err) {
      console.error("[search] travel-again query failed:", err);
    }
  }

  const fxRates = await getLatestRates();

  return (
    <div className="container py-8">
      <BookingProgress currentStep={1} />

      {/* Listing hero (Figma "Find the Best Deals") — blue band with the
          search card floating over its lower edge. */}
      <div className="relative mt-4 overflow-hidden rounded-[10px] bg-brand px-6 pb-24 pt-8">
        <p className="text-sm font-medium text-brand-periwinkle">
          Let Journey Begin with Gilifast!
        </p>
        <h1 className="mt-1 max-w-xl font-display text-2xl font-extrabold leading-[1.05] text-white sm:text-4xl">
          Find the best deals on boats for your trip
        </h1>
      </div>
      <div className="relative z-10 -mt-24 mb-8 rounded-[10px] bg-white shadow-ambient">
        <SearchForm
          origins={origins}
          destinations={destinations}
          defaultOrigin={origin}
          defaultDestination={destination}
          defaultDate={date}
          defaultReturnDate={returnDate}
          defaultPassengers={passengers}
          defaultTripType={returnDate ? "round_trip" : "one_way"}
        />
      </div>

      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold tracking-tight">
            {origin ? `${origin} → ${destination}` : `Boats to ${destination}`}
          </h1>
          {seaCondition ? (
            <Badge variant={seaCondition.tone}>{seaCondition.label}</Badge>
          ) : null}
        </div>
        <p className="text-sm text-muted-foreground">
          {dateProvided
            ? formatLocalDate(startUtc, "EEEE, dd MMM yyyy")
            : "Upcoming departures · next 14 days"}{" "}
          · {passengers} passenger{passengers === 1 ? "" : "s"}
          {returnDate ? (
            <>
              {" "}· returning {formatLocalDate(localDateTimeToUtc(returnDate, "00:00"), "dd MMM")}
            </>
          ) : null}
        </p>
      </div>

      {!legsError && legs.length > 0 ? (
        <div className="mb-4">
          <SearchFilters
            sortBy={sortBy}
            timeSlot={timeSlot}
            maxPrice={maxPrice ?? null}
          />
        </div>
      ) : null}

      {legsError ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            We&apos;re having trouble loading departures right now. Please try
            again in a moment.
            {legsErrorDetail ? (
              <div className="mt-3 inline-block rounded bg-slate-50 px-2 py-1 font-mono text-xs text-slate-500">
                {legsErrorDetail}
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : legs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {dateProvided
              ? "No departures on this date. Try a different day."
              : "No upcoming departures for this route in the next 14 days."}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {legsWithAdjustedPricing.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                No departures match your filters. Try widening the time or price
                range.
              </CardContent>
            </Card>
          ) : null}
          {legsWithAdjustedPricing.map((leg) => {
            const rating = ratingsByScheduleId.get(leg.scheduleId);
            const urgency = seatUrgency(leg.availableSeats);
            const travelAgainKey = `${leg.schedule.originPort}|${leg.schedule.destinationPort}|${leg.operatorId}`;
            const showTravelAgain = travelAgainRoutes.has(travelAgainKey);
            const priceIdr = Number(leg.adjustedPrice);
            const fxDisplay = formatWithDisplay(priceIdr, "USD", fxRates);
            return (
              <Card key={leg.id}>
                <CardHeader className="pb-2">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      {leg.schedule.boat.photos.length > 0 ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={leg.schedule.boat.photos[0]}
                          alt={leg.schedule.boat.name}
                          className="hidden h-16 w-20 shrink-0 rounded-md border object-cover sm:block"
                        />
                      ) : null}
                      <div>
                      <CardTitle className="text-2xl">
                        {formatLocalTime(leg.departureDate)}
                        {!dateProvided ? (
                          <span className="ml-2 text-xs font-normal text-muted-foreground">
                            {formatLocalDate(leg.departureDate, "EEE dd MMM")}
                          </span>
                        ) : null}
                      </CardTitle>
                      <CardDescription>
                        {!origin ? (
                          <>
                            <span className="font-medium text-slate-900">
                              from {leg.schedule.originPort}
                            </span>{" "}·{" "}
                          </>
                        ) : null}
                        {leg.schedule.boat.name} ·{" "}
                        {leg.schedule.durationMinutes} min
                        {rating && rating.count > 0 ? (
                          <>
                            {" "}· <span className="text-amber-600">★ {rating.avg.toFixed(1)}</span>{" "}
                            <span className="text-muted-foreground">
                              ({rating.count} review{rating.count === 1 ? "" : "s"})
                            </span>
                          </>
                        ) : null}
                      </CardDescription>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold">
                        {fxDisplay.primary}
                      </div>
                      {fxDisplay.secondary ? (
                        <div className="text-xs text-slate-500">{fxDisplay.secondary}</div>
                      ) : null}
                      {leg.isPriceSurged ? (
                        <div className="text-xs text-amber-600">High demand</div>
                      ) : null}
                      <div className="text-xs text-muted-foreground">
                        per passenger
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="success">
                      Direct · {leg.schedule.durationMinutes}m
                    </Badge>
                    {urgency ? (
                      <Badge variant={urgency.tone}>{urgency.label}</Badge>
                    ) : null}
                    {leg.availableSeats < passengers ? (
                      <span className="text-red-600">
                        Not enough seats for {passengers}
                      </span>
                    ) : null}
                    {showTravelAgain ? (
                      <Badge variant="outline" className="border-gilifast-ocean text-gilifast-ocean">
                        Travel Again
                      </Badge>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-3">
                    <Link
                      href="/best-price-guarantee"
                      className="text-xs text-slate-500 hover:underline"
                      title="Best Price Guarantee"
                    >
                      Best Price ✓
                    </Link>
                    <Button asChild disabled={leg.availableSeats < passengers}>
                      <Link
                        href={`/book/${leg.id}?passengers=${passengers}`}
                        aria-disabled={leg.availableSeats < passengers}
                      >
                        Book {passengers} ·{" "}
                        {formatIDR(Number(leg.adjustedPrice) * passengers)}
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Connection results */}
      {!legsError && connections.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-3 text-base font-semibold text-slate-700">
            Via connections
          </h2>
          <div className="space-y-3">
            {connections.map((conn) => (
              <Card
                key={`${conn.leg1.id}-${conn.leg2.id}`}
                className="border-dashed"
              >
                <CardHeader className="pb-2">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-lg">
                        {formatLocalTime(conn.leg1.departureDate)}{" "}
                        <span className="text-sm font-normal text-muted-foreground">
                          → {conn.transferPort} →
                        </span>{" "}
                        {formatLocalTime(conn.leg2.departureDate)}
                      </CardTitle>
                      <CardDescription>
                        Transfer at {conn.transferPort} ·{" "}
                        {conn.transferWaitMinutes} min wait ·{" "}
                        ~{Math.round(conn.totalDurationMinutes / 60)}h{" "}
                        {conn.totalDurationMinutes % 60}m total
                      </CardDescription>
                    </div>
                    <div className="text-right">
                      <div className="text-xl font-bold">
                        {formatIDR(conn.totalPrice * passengers)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatIDR(conn.totalPrice)} per pax · 2 legs
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="warning">
                      Transit · via {conn.transferPort}
                    </Badge>
                    <span>
                      {conn.leg1.schedule.boat.name} + {conn.leg2.schedule.boat.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Link
                      href="/best-price-guarantee"
                      className="text-xs text-slate-500 hover:underline"
                      title="Best Price Guarantee"
                    >
                      Best Price ✓
                    </Link>
                    <Button asChild variant="outline" size="sm">
                      <Link
                        href={`/book/${conn.leg1.id}?passengers=${passengers}`}
                      >
                        Book leg 1 first
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
