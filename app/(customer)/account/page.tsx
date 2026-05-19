import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireCustomer, clearCustomerSession } from "@/lib/auth";
import { formatLocalDate, formatLocalTime } from "@/lib/datetime";
import { formatIDR } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const metadata = { title: "My account · Gilijet" };

async function logoutAction() {
  "use server";
  await clearCustomerSession();
  redirect("/");
}

function statusVariant(status: string) {
  switch (status) {
    case "CONFIRMED":
      return "success" as const;
    case "PENDING_PAYMENT":
      return "warning" as const;
    case "EXPIRED":
    case "CANCELLED_BY_CUSTOMER":
    case "CANCELLED_BY_OPERATOR":
      return "destructive" as const;
    default:
      return "outline" as const;
  }
}

export default async function AccountPage() {
  const session = await requireCustomer();

  const customer = await prisma.customer.findUnique({
    where: { id: session.sub },
  });
  if (!customer) {
    await clearCustomerSession();
    redirect("/account/login");
  }

  // Pull bookings linked by customerId OR matching the customer's email
  // (covers bookings made before the user registered).
  const bookings = await prisma.booking.findMany({
    where: {
      OR: [
        { customerId: session.sub },
        { customerEmail: session.email },
      ],
    },
    include: {
      leg: { include: { schedule: { include: { boat: true } } } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const now = Date.now();
  const upcoming = bookings.filter(
    (b) => b.status === "CONFIRMED" && b.leg.departureDate.getTime() > now,
  );
  const past = bookings.filter((b) => !upcoming.includes(b));

  return (
    <div className="container py-10">
      <div className="mx-auto max-w-4xl">
        {/* Profile header */}
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Hi, {customer.fullName.split(" ")[0]}
            </h1>
            <p className="text-sm text-slate-600">{customer.email}</p>
          </div>
          <form action={logoutAction}>
            <Button type="submit" variant="outline" size="sm">
              Sign out
            </Button>
          </form>
        </div>

        {/* Quick stats */}
        <div className="mb-8 grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Upcoming trips</CardDescription>
              <CardTitle className="text-3xl">{upcoming.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total bookings</CardDescription>
              <CardTitle className="text-3xl">{bookings.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Quick action</CardDescription>
              <CardContent className="px-0 pt-2 pb-0">
                <Button asChild size="sm" className="w-full">
                  <Link href="/">Book a new trip</Link>
                </Button>
              </CardContent>
            </CardHeader>
          </Card>
        </div>

        {/* Upcoming */}
        <h2 className="mb-3 text-lg font-bold tracking-tight">Upcoming trips</h2>
        {upcoming.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-slate-600">
              No upcoming trips. <Link href="/" className="text-sky-700 hover:underline">Find a boat →</Link>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {upcoming.map((b) => (
              <BookingCard key={b.id} booking={b} />
            ))}
          </div>
        )}

        {/* History */}
        {past.length > 0 && (
          <>
            <h2 className="mt-10 mb-3 text-lg font-bold tracking-tight">
              Booking history
            </h2>
            <div className="space-y-3">
              {past.map((b) => (
                <BookingCard key={b.id} booking={b} muted />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

type BookingWithLeg = {
  id: string;
  bookingReference: string;
  status: string;
  totalAmount: unknown;
  leg: {
    departureDate: Date;
    schedule: {
      originPort: string;
      destinationPort: string;
      boat: { name: string };
    };
  };
};

function BookingCard({
  booking,
  muted,
}: {
  booking: BookingWithLeg;
  muted?: boolean;
}) {
  return (
    <Card className={muted ? "opacity-70" : ""}>
      <CardContent className="flex flex-wrap items-start justify-between gap-4 p-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-900">
              {booking.leg.schedule.originPort} →{" "}
              {booking.leg.schedule.destinationPort}
            </span>
            <Badge variant={statusVariant(booking.status)} className="text-xs">
              {booking.status.replace(/_/g, " ")}
            </Badge>
          </div>
          <div className="mt-1 text-sm text-slate-600">
            {formatLocalDate(booking.leg.departureDate, "EEE, dd MMM yyyy")}{" "}
            ·{" "}
            <span className="font-mono">
              {formatLocalTime(booking.leg.departureDate)}
            </span>{" "}
            WITA · {booking.leg.schedule.boat.name}
          </div>
          <div className="mt-1 font-mono text-xs text-slate-500">
            {booking.bookingReference}
          </div>
        </div>
        <div className="text-right">
          <div className="font-semibold">
            {formatIDR(Number(booking.totalAmount))}
          </div>
          <Button asChild size="sm" variant="outline" className="mt-2">
            <Link href={`/b/${booking.bookingReference}`}>View</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
