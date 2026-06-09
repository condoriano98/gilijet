import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { formatLocalDate, formatLocalTime, localDateTimeToUtc } from "@/lib/datetime";
import { formatIDR } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const metadata = { title: "Request date change · Gilijet" };

const submitSchema = z.object({
  reference: z.string().min(1),
  requestedLegId: z.string().min(1),
  customerNote: z.string().max(500).optional().or(z.literal("")),
  confirmEmail: z.string().email(),
});

async function submitRescheduleAction(formData: FormData) {
  "use server";
  const parsed = submitSchema.safeParse({
    reference: formData.get("reference"),
    requestedLegId: formData.get("requestedLegId"),
    customerNote: formData.get("customerNote"),
    confirmEmail: formData.get("confirmEmail"),
  });
  if (!parsed.success) {
    redirect(
      `/b/${formData.get("reference")}/reschedule?error=${encodeURIComponent(parsed.error.issues[0].message)}`,
    );
  }

  const booking = await prisma.booking.findUnique({
    where: { bookingReference: parsed.data.reference },
    include: { leg: true, rescheduleRequest: true },
  });
  if (!booking) redirect("/b?error=missing");
  if (
    booking.customerEmail.toLowerCase() !==
    parsed.data.confirmEmail.toLowerCase()
  ) {
    redirect(
      `/b/${parsed.data.reference}/reschedule?error=${encodeURIComponent("Email does not match booking")}`,
    );
  }
  if (booking.status !== "CONFIRMED") {
    redirect(
      `/b/${parsed.data.reference}?error=${encodeURIComponent("Only confirmed bookings can be rescheduled")}`,
    );
  }
  if (booking.leg.departureDate.getTime() <= Date.now()) {
    redirect(
      `/b/${parsed.data.reference}?error=${encodeURIComponent("Departure has already passed")}`,
    );
  }
  if (
    booking.rescheduleRequest &&
    booking.rescheduleRequest.status === "PENDING"
  ) {
    redirect(
      `/b/${parsed.data.reference}?error=${encodeURIComponent("A reschedule request is already pending")}`,
    );
  }
  if (parsed.data.requestedLegId === booking.legId) {
    redirect(
      `/b/${parsed.data.reference}/reschedule?error=${encodeURIComponent("Pick a different departure")}`,
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
    target.status !== "OPEN" ||
    target.schedule.originPort !== original.schedule.originPort ||
    target.schedule.destinationPort !== original.schedule.destinationPort
  ) {
    redirect(
      `/b/${parsed.data.reference}/reschedule?error=${encodeURIComponent("Selected departure is unavailable")}`,
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
      status: "PENDING",
    },
    update: {
      requestedLegId: parsed.data.requestedLegId,
      customerNote: parsed.data.customerNote?.trim() || null,
      status: "PENDING",
      processedBy: null,
      processedAt: null,
      adminNote: null,
    },
  });

  await audit({
    entityType: "BOOKING",
    entityId: booking.id,
    action: "reschedule_requested",
    userRole: "CUSTOMER",
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
      rescheduleRequest: true,
    },
  });
  if (!booking) notFound();
  if (booking.status !== "CONFIRMED") {
    redirect(`/b/${reference}`);
  }

  const seatCount = Math.max(
    1,
    booking.notes
      ? (() => {
          try {
            const parsed = JSON.parse(booking.notes) as { passengers?: Array<{ type?: string }> };
            return Array.isArray(parsed.passengers)
              ? parsed.passengers.filter((p) => p.type !== "INFANT").length
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
    date ?? new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const startUtc = localDateTimeToUtc(defaultDate, "00:00");
  const endUtc = localDateTimeToUtc(defaultDate, "23:59");

  const candidateLegs = await prisma.leg.findMany({
    where: {
      status: "OPEN",
      availableSeats: { gte: seatCount },
      departureDate: { gte: startUtc, lte: endUtc },
      schedule: {
        originPort: booking.leg.schedule.originPort,
        destinationPort: booking.leg.schedule.destinationPort,
        status: "ACTIVE",
      },
      NOT: { id: booking.legId },
    },
    include: { schedule: { include: { boat: true } } },
    orderBy: { departureDate: "asc" },
    take: 20,
  });

  return (
    <div className="container py-8">
      <div className="mx-auto max-w-2xl space-y-4">
        <Link
          href={`/b/${reference}`}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Back to booking
        </Link>

        <Card>
          <CardHeader>
            <CardTitle>Request a date change</CardTitle>
            <CardDescription>
              Currently on{" "}
              <strong>
                {formatLocalDate(booking.leg.departureDate, "EEE, dd MMM yyyy")} ·{" "}
                {formatLocalTime(booking.leg.departureDate)}
              </strong>
              . Pick a new departure on the same route — operators usually
              approve within a few hours.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <form className="flex flex-wrap items-end gap-2" action="">
              <input type="hidden" name="reference" value={reference} />
              <div className="space-y-1">
                <Label htmlFor="date">Choose a new date</Label>
                <Input
                  id="date"
                  name="date"
                  type="date"
                  defaultValue={defaultDate}
                  min={new Date().toISOString().slice(0, 10)}
                />
              </div>
              <Button type="submit" variant="outline" size="sm">
                Show departures
              </Button>
            </form>
          </CardContent>
        </Card>

        {error ? (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        {booking.rescheduleRequest?.status === "PENDING" ? (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
            You already have a pending reschedule request. Submitting a new one
            will replace it.
          </p>
        ) : null}

        {candidateLegs.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              No departures with enough seats on this date. Try another date.
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {booking.leg.schedule.originPort} →{" "}
                {booking.leg.schedule.destinationPort}
              </CardTitle>
              <CardDescription>
                {formatLocalDate(startUtc, "EEEE, dd MMM yyyy")} · {seatCount}{" "}
                seat{seatCount === 1 ? "" : "s"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {candidateLegs.map((leg) => (
                <form
                  key={leg.id}
                  action={submitRescheduleAction}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-white p-3"
                >
                  <input type="hidden" name="reference" value={reference} />
                  <input
                    type="hidden"
                    name="requestedLegId"
                    value={leg.id}
                  />
                  <div>
                    <div className="text-base font-semibold">
                      {formatLocalTime(leg.departureDate)} WITA
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {leg.schedule.boat.name} ·{" "}
                      {leg.schedule.durationMinutes} min ·{" "}
                      {formatIDR(Number(leg.basePrice))}/pax ·{" "}
                      {leg.availableSeats} seats left
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center">
                    <Input
                      type="email"
                      name="confirmEmail"
                      placeholder="Confirm email"
                      required
                      className="w-52"
                    />
                    <Button type="submit" size="sm">
                      Request this
                    </Button>
                  </div>
                </form>
              ))}
            </CardContent>
          </Card>
        )}

        <p className="text-xs text-muted-foreground">
          Need to add a note for the operator? Send your reasons by WhatsApp
          after submitting — references your booking by code.
        </p>
      </div>
    </div>
  );
}
