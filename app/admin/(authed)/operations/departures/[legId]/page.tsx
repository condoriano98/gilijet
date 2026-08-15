import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/auth";
import { formatLocalDateTime } from "@/lib/datetime";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { adjustDeparturePrice, cancelDeparture } from "../../actions";

export const metadata = { title: "Departure · Operations" };

export default async function DepartureDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ legId: string }>;
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  await requireSuperAdmin();
  const { legId } = await params;
  const { error, ok } = await searchParams;

  // Deliberately unscoped: admin queries are cross-tenant on purpose, and the
  // operator is read off the leg for the actions rather than supplied by the
  // caller.
  const leg = await prisma.leg.findUnique({
    where: { id: legId },
    include: {
      operator: { select: { id: true, companyName: true } },
      schedule: {
        select: {
          id: true,
          originPort: true,
          destinationPort: true,
          boat: { select: { name: true } },
        },
      },
      bookings: {
        where: { status: { in: ["CONFIRMED", "AWAITING_CONFIRMATION", "PENDING_PAYMENT"] } },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          bookingReference: true,
          customerName: true,
          customerPhone: true,
          status: true,
          tickets: { select: { passengerName: true, status: true } },
        },
      },
    },
  });
  if (!leg) notFound();

  const passengers = leg.bookings.flatMap((b) => b.tickets);
  const closed = leg.status === "CANCELLED" || leg.status === "SAILED";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/admin/operations"
            className="text-sm text-muted-foreground hover:underline"
          >
            ← All departures
          </Link>
          <h2 className="mt-1 text-xl font-bold tracking-tight">
            {leg.schedule.originPort} → {leg.schedule.destinationPort}
          </h2>
          <p className="text-sm text-muted-foreground">
            {formatLocalDateTime(leg.departureDate)} WITA ·{" "}
            {leg.operator.companyName} · {leg.schedule.boat.name}
          </p>
        </div>
        <Badge
          variant={
            leg.status === "OPEN"
              ? "success"
              : leg.status === "CANCELLED"
                ? "destructive"
                : "outline"
          }
        >
          {leg.status}
        </Badge>
      </div>

      {ok ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
          Saved.
        </div>
      ) : null}
      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}
      {leg.status === "CANCELLED" && leg.cancellationReason ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          Cancelled: {leg.cancellationReason}
        </div>
      ) : null}

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Passengers</CardTitle>
            <CardDescription>
              {passengers.length} passenger{passengers.length === 1 ? "" : "s"} on
              confirmed and held bookings.
            </CardDescription>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Price</CardTitle>
            <CardDescription>
              Applies to this departure only. The schedule&apos;s base price is
              unchanged, and the {passengers.length} passenger
              {passengers.length === 1 ? "" : "s"} already sold keep what they
              were charged.
            </CardDescription>
          </CardHeader>
          <form action={adjustDeparturePrice}>
            <CardContent>
              <input type="hidden" name="legId" value={leg.id} />
              <div className="grid gap-1.5">
                <Label htmlFor="basePrice">Base price (IDR)</Label>
                <Input
                  id="basePrice"
                  name="basePrice"
                  type="number"
                  min={1000}
                  max={50000000}
                  step={1000}
                  defaultValue={Number(leg.basePrice)}
                  disabled={closed}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Per adult, before multipliers and service fee.
                </p>
              </div>
            </CardContent>
            <CardFooter className="justify-end">
              <Button type="submit" variant="outline" disabled={closed}>
                Update price
              </Button>
            </CardFooter>
          </form>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cancel departure</CardTitle>
            <CardDescription>
              Cancels every confirmed booking on this sailing and raises refunds
              for them. This cannot be undone.
            </CardDescription>
          </CardHeader>
          <form action={cancelDeparture}>
            <CardContent>
              <input type="hidden" name="legId" value={leg.id} />
              <div className="grid gap-1.5">
                <Label htmlFor="reason">Reason</Label>
                <Input
                  id="reason"
                  name="reason"
                  placeholder="Bad weather — BMKG warning"
                  disabled={closed}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Shown to affected customers.
                </p>
              </div>
            </CardContent>
            <CardFooter className="justify-end">
              <Button type="submit" variant="destructive" disabled={closed}>
                {leg.status === "CANCELLED"
                  ? "Already cancelled"
                  : `Cancel and refund ${leg.bookings.filter((b) => b.status === "CONFIRMED").length} booking(s)`}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Manifest ({passengers.length})</CardTitle>
          <CardDescription>
            Passengers on confirmed and held bookings.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {leg.bookings.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No bookings yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reference</TableHead>
                  <TableHead>Lead passenger</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Passengers</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leg.bookings.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-mono text-xs">
                      {b.bookingReference}
                    </TableCell>
                    <TableCell className="text-sm">{b.customerName}</TableCell>
                    <TableCell className="text-sm">{b.customerPhone}</TableCell>
                    <TableCell className="text-sm">
                      {b.tickets.map((t) => t.passengerName).join(", ") || "—"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={b.status === "CONFIRMED" ? "success" : "warning"}
                      >
                        {b.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
