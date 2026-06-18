import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireOperator } from "@/lib/auth";
import { getOperatorLeg } from "@/lib/operator-data";
import { cancelLeg } from "@/lib/legs";
import { audit } from "@/lib/audit";
import {
  Card,
  CardContent,
  CardDescription,
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatLocalDate, formatLocalTime } from "@/lib/datetime";

const cancelSchema = z.object({
  id: z.string(),
  reason: z.string().min(3).max(280),
  cancellationType: z.enum(["STANDARD", "WEATHER"]).default("STANDARD"),
});

async function cancelLegAction(formData: FormData) {
  "use server";
  const session = await requireOperator();
  const parsed = cancelSchema.safeParse({
    id: formData.get("id"),
    reason: formData.get("reason"),
    cancellationType: formData.get("cancellationType") ?? "STANDARD",
  });
  if (!parsed.success) {
    redirect(
      `/operator/legs/${formData.get("id")}?error=` +
        encodeURIComponent("Reason must be 3-280 characters"),
    );
  }
  try {
    await cancelLeg({
      legId: parsed.data.id,
      reason: parsed.data.reason,
      operatorId: session.sub,
    });

    if (parsed.data.cancellationType === "WEATHER") {
      const bookings = await prisma.booking.findMany({
        where: { legId: parsed.data.id, status: "CONFIRMED" },
        include: { payment: true },
      });
      for (const booking of bookings) {
        const { refundAmountForOperatorCancellation } = await import("@/lib/refunds");
        const refundAmount = refundAmountForOperatorCancellation(booking.totalAmount);
        await prisma.$transaction(async (tx) => {
          await tx.booking.update({
            where: { id: booking.id },
            data: { status: "CANCELLED_BY_OPERATOR" },
          });
          await tx.ticket.updateMany({
            where: { bookingId: booking.id, status: { in: ["ISSUED"] } },
            data: { status: "REFUNDED" },
          });
          const existingRefund = await tx.refund.findUnique({ where: { bookingId: booking.id } });
          if (!existingRefund && refundAmount.gt(0)) {
            await tx.refund.create({
              data: {
                bookingId: booking.id,
                originalAmount: booking.totalAmount,
                refundAmount,
                reason: "WEATHER",
                status: "PENDING",
              },
            });
          }
        });
        await audit({
          entityType: "BOOKING",
          entityId: booking.id,
          action: "weather_cancelled",
          userRole: "SYSTEM",
          newState: { reason: "WEATHER", refundAmount: refundAmount.toString() },
        });
      }
    }

    redirect(`/operator/legs/${parsed.data.id}?ok=cancelled`);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    redirect(
      `/operator/legs/${parsed.data.id}?error=` + encodeURIComponent(message),
    );
  }
}

async function manualCheckinAction(formData: FormData) {
  "use server";
  const session = await requireOperator();
  const ticketId = String(formData.get("ticketId") ?? "");
  const legId = String(formData.get("legId") ?? "");
  if (!ticketId || !legId) redirect(`/operator/legs/${legId}`);

  const ticket = await prisma.ticket.findFirst({
    where: { id: ticketId, booking: { legId, operatorId: session.sub } },
  });
  if (!ticket || ticket.status !== "ISSUED") {
    redirect(`/operator/legs/${legId}?error=ticket_not_checkinable`);
  }
  await prisma.ticket.update({
    where: { id: ticket.id },
    data: {
      status: "CHECKED_IN",
      checkedInAt: new Date(),
      checkedInBy: session.sub,
    },
  });
  await audit({
    entityType: "TICKET",
    entityId: ticket.id,
    action: "checked_in_manual",
    userId: session.sub,
    userRole: "OPERATOR",
    newState: { status: "CHECKED_IN" },
  });
  redirect(`/operator/legs/${legId}?ok=checkedin`);
}

export default async function LegManifestPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const session = await requireOperator();
  const { id } = await params;
  const { error, ok } = await searchParams;
  const leg = await getOperatorLeg(session.sub, id);
  if (!leg) notFound();

  const confirmedBookings = leg.bookings.filter(
    (b) => b.status === "CONFIRMED",
  );
  const allTickets = confirmedBookings.flatMap((b) => b.tickets);
  const checkedIn = allTickets.filter((t) => t.status === "CHECKED_IN").length;
  const issued = allTickets.filter((t) => t.status === "ISSUED").length;
  const cancelled = leg.status === "CANCELLED";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/operator/legs"
            className="text-sm text-muted-foreground hover:underline"
          >
            ← All departures
          </Link>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">
            {leg.schedule.originPort} → {leg.schedule.destinationPort}
          </h1>
          <p className="text-sm text-muted-foreground">
            {formatLocalDate(leg.departureDate)} ·{" "}
            <span className="font-mono">
              {formatLocalTime(leg.departureDate)}
            </span>{" "}
            · {leg.schedule.boat.name}
          </p>
        </div>
        <Badge variant={cancelled ? "destructive" : "outline"} className="text-sm">
          {leg.status}
        </Badge>
      </div>

      {ok === "cancelled" ? (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Departure cancelled. Refund records are queued for processing in
          Phase 4.
        </p>
      ) : null}
      {ok === "checkedin" ? (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Passenger checked in.
        </p>
      ) : null}
      {error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error.replace(/_/g, " ")}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Seats sold</CardDescription>
            <CardTitle className="text-3xl">
              {leg.totalCapacity - leg.availableSeats}/{leg.totalCapacity}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Checked in</CardDescription>
            <CardTitle className="text-3xl">{checkedIn}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Awaiting boarding</CardDescription>
            <CardTitle className="text-3xl">{issued}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button asChild>
          <Link href={`/operator/scanner?legId=${leg.id}`}>Open scanner</Link>
        </Button>
        <Button asChild variant="outline">
          <a href={`/api/operator/manifest/${leg.id}/csv`} download>
            Download CSV
          </a>
        </Button>
        <Button asChild variant="outline">
          <Link href={`/print/manifest/${leg.id}`} target="_blank">
            Print manifest
          </Link>
        </Button>
        {!cancelled && leg.status !== "SAILED" ? (
          <details className="group rounded-md border bg-card">
            <summary className="cursor-pointer list-none px-3 py-2 text-sm font-medium text-destructive">
              Cancel departure
            </summary>
            <form action={cancelLegAction} className="space-y-3 p-3">
              <input type="hidden" name="id" value={leg.id} />
              <div className="space-y-1">
                <Label htmlFor="cancellationType">Cancellation reason</Label>
                <select
                  id="cancellationType"
                  name="cancellationType"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="STANDARD">Standard cancellation</option>
                  <option value="WEATHER">Weather — unsafe conditions</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="reason">Reason (visible to customers)</Label>
                <Textarea
                  id="reason"
                  name="reason"
                  rows={2}
                  placeholder="e.g. High waves at Sanur, advisory from harbormaster"
                  required
                  minLength={3}
                  maxLength={280}
                />
              </div>
              <Button type="submit" variant="destructive" size="sm">
                Confirm cancellation
              </Button>
            </form>
          </details>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Manifest</CardTitle>
          <CardDescription>
            {confirmedBookings.length} confirmed booking
            {confirmedBookings.length === 1 ? "" : "s"} ·{" "}
            {allTickets.length} passenger
            {allTickets.length === 1 ? "" : "s"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {allTickets.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No confirmed passengers yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Passenger</TableHead>
                  <TableHead>Ticket</TableHead>
                  <TableHead>Booking</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {confirmedBookings.flatMap((b) =>
                  b.tickets.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">
                        {t.passengerName}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {t.ticketCode}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {b.bookingReference}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            t.status === "CHECKED_IN"
                              ? "success"
                              : t.status === "REFUNDED"
                                ? "destructive"
                                : t.status === "NO_SHOW"
                                  ? "warning"
                                  : "outline"
                          }
                        >
                          {t.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {t.status === "ISSUED" && !cancelled ? (
                          <form action={manualCheckinAction}>
                            <input type="hidden" name="ticketId" value={t.id} />
                            <input type="hidden" name="legId" value={leg.id} />
                            <Button type="submit" variant="outline" size="sm">
                              Manual check-in
                            </Button>
                          </form>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  )),
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
