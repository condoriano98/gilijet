import Link from "next/link";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  formatLocalDate,
  formatLocalTime,
  localDateTimeToUtc,
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
import { BookingProgress } from "@/components/customer/booking-progress";
import { formatIDR } from "@/lib/utils";
import { findConnections } from "@/lib/connection-search";
import { parsePricingTiers, computeYieldAdjustedPrice } from "@/lib/pricing";

const querySchema = z.object({
  origin: z.string().min(2),
  destination: z.string().min(2),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  passengers: z.coerce.number().int().min(1).max(10).default(1),
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
      where: { status: "ACTIVE", boat: { status: "ACTIVE" } },
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
    return (
      <div className="container py-10">
        <h1 className="mb-6 text-2xl font-bold tracking-tight">Find a boat</h1>
        <SearchForm origins={origins} destinations={destinations} />
        <p className="mt-4 text-sm text-red-700">
          Please fill in the search form to see results.
        </p>
      </div>
    );
  }

  const { origin, destination, date, passengers } = parsed.data;

  // Lazy expiry sweep so freed seats show up in the next render. Don't
  // let a sweep failure block the page.
  try {
    await expireStalePendingBookings();
  } catch (err) {
    console.error("[search] expireStalePendingBookings failed:", err);
  }

  // The user's selected day, expressed as the UTC window from local 00:00
  // to local 23:59:59 in WITA.
  const startUtc = localDateTimeToUtc(date, "00:00");
  const endUtc = localDateTimeToUtc(date, "23:59");

  type LegWithSchedule = Prisma.LegGetPayload<{
    include: { schedule: { include: { boat: true } } };
  }>;
  let legs: LegWithSchedule[] = [];
  let legsError = false;
  try {
    legs = await prisma.leg.findMany({
      where: {
        departureDate: { gte: startUtc, lte: endUtc },
        status: { in: ["OPEN"] },
        availableSeats: { gte: passengers },
        schedule: {
          is: {
            originPort: { equals: origin, mode: "insensitive" },
            destinationPort: { equals: destination, mode: "insensitive" },
            status: "ACTIVE",
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
  }

  // Apply yield-adjusted pricing to each leg
  const legsWithAdjustedPricing = legs.map((leg) => {
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

  // Connection search (only when no direct legs found, or always show as alternative)
  let connections: Awaited<ReturnType<typeof findConnections>> = [];
  if (!legsError) {
    try {
      connections = await findConnections(origin, destination, startUtc, endUtc, passengers);
    } catch (err) {
      console.error("[search] connection search failed:", err);
    }
  }

  return (
    <div className="container py-8">
      <BookingProgress currentStep={1} />
      <div className="mb-6">
        <SearchForm
          origins={origins}
          destinations={destinations}
          defaultOrigin={origin}
          defaultDestination={destination}
          defaultDate={date}
          defaultPassengers={passengers}
        />
      </div>

      <div className="mb-3 flex items-baseline justify-between">
        <h1 className="text-xl font-bold tracking-tight">
          {origin} → {destination}
        </h1>
        <p className="text-sm text-muted-foreground">
          {formatLocalDate(startUtc, "EEEE, dd MMM yyyy")} ·{" "}
          {passengers} passenger{passengers === 1 ? "" : "s"}
        </p>
      </div>

      {legsError ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            We&apos;re having trouble loading departures right now. Please try
            again in a moment.
          </CardContent>
        </Card>
      ) : legs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No departures match. Try a different date or route.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {legsWithAdjustedPricing.map((leg) => (
            <Card key={leg.id}>
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-2xl">
                      {formatLocalTime(leg.departureDate)}
                    </CardTitle>
                    <CardDescription>
                      {leg.schedule.boat.name} ·{" "}
                      {leg.schedule.durationMinutes} min
                    </CardDescription>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold">
                      {formatIDR(Number(leg.adjustedPrice))}
                    </div>
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
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="success">{leg.availableSeats} seats left</Badge>
                  {leg.availableSeats < passengers ? (
                    <span className="text-red-600">
                      Not enough seats for {passengers}
                    </span>
                  ) : null}
                </div>
                <Button asChild disabled={leg.availableSeats < passengers}>
                  <Link
                    href={`/book/${leg.id}?passengers=${passengers}`}
                    aria-disabled={leg.availableSeats < passengers}
                  >
                    Book {passengers} ·{" "}
                    {formatIDR(Number(leg.adjustedPrice) * passengers)}
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
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
                  <div className="text-xs text-muted-foreground">
                    {conn.leg1.schedule.boat.name} + {conn.leg2.schedule.boat.name}
                  </div>
                  <Button asChild variant="outline" size="sm">
                    <Link
                      href={`/book/${conn.leg1.id}?passengers=${passengers}`}
                    >
                      Book leg 1 first
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
