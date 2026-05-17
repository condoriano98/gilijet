import Link from "next/link";
import { z } from "zod";
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
import { formatIDR } from "@/lib/utils";

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

  const schedules = await prisma.schedule.findMany({
    where: { status: "ACTIVE", boat: { status: "ACTIVE" } },
    select: { originPort: true, destinationPort: true },
  });
  const origins = Array.from(new Set(schedules.map((s) => s.originPort))).sort();
  const destinations = Array.from(
    new Set(schedules.map((s) => s.destinationPort)),
  ).sort();

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

  // Lazy expiry sweep so freed seats show up in the next render.
  await expireStalePendingBookings();

  // The user's selected day, expressed as the UTC window from local 00:00
  // to local 23:59:59 in WITA.
  const startUtc = localDateTimeToUtc(date, "00:00");
  const endUtc = localDateTimeToUtc(date, "23:59");

  const legs = await prisma.leg.findMany({
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

  return (
    <div className="container py-8">
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

      {legs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No departures match. Try a different date or route.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {legs.map((leg) => (
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
                      {formatIDR(Number(leg.basePrice))}
                    </div>
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
                    {formatIDR(Number(leg.basePrice) * passengers)}
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
