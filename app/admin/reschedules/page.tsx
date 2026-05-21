import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
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
import { formatLocalDate, formatLocalTime } from "@/lib/datetime";
import { Textarea } from "@/components/ui/textarea";

export const metadata = { title: "Reschedule requests · Admin" };

async function approveAction(formData: FormData) {
  "use server";
  const session = await requireAdmin();
  const requestId = String(formData.get("requestId"));
  const adminNote = String(formData.get("adminNote") ?? "").trim() || null;
  if (!requestId) redirect("/admin/reschedules");

  const request = await prisma.rescheduleRequest.findUnique({
    where: { id: requestId },
    include: { booking: true, originalLeg: true, requestedLeg: true },
  });
  if (!request || request.status !== "PENDING") {
    redirect("/admin/reschedules?error=not_pending");
  }

  // Count non-infant passengers from booking notes
  let seatCount = 1;
  if (request.booking.notes) {
    try {
      const parsed = JSON.parse(request.booking.notes) as {
        passengers?: Array<{ type?: string }>;
      };
      if (Array.isArray(parsed.passengers)) {
        seatCount = parsed.passengers.filter((p) => p.type !== "INFANT").length;
      }
    } catch {
      // free-text notes; assume 1 seat
    }
  }

  try {
    await prisma.$transaction(async (tx) => {
      // Reserve seats on the requested leg atomically
      const reservation = await tx.leg.updateMany({
        where: {
          id: request.requestedLegId,
          status: "OPEN",
          availableSeats: { gte: seatCount },
        },
        data: { availableSeats: { decrement: seatCount } },
      });
      if (reservation.count === 0) {
        throw new Error("REQUESTED_LEG_UNAVAILABLE");
      }

      // Release seats on the original leg
      await tx.leg.update({
        where: { id: request.originalLegId },
        data: {
          availableSeats: { increment: seatCount },
          status: "OPEN",
        },
      });

      // Flip the requested leg to FULL if it just hit zero
      await tx.leg.updateMany({
        where: {
          id: request.requestedLegId,
          availableSeats: 0,
          status: "OPEN",
        },
        data: { status: "FULL" },
      });

      // Move the booking to the new leg
      await tx.booking.update({
        where: { id: request.bookingId },
        data: { legId: request.requestedLegId },
      });

      await tx.rescheduleRequest.update({
        where: { id: requestId },
        data: {
          status: "APPROVED",
          processedBy: session.sub,
          processedAt: new Date(),
          adminNote,
        },
      });
    });
  } catch (err) {
    console.error("[reschedule] approval failed:", err);
    redirect(`/admin/reschedules?error=approval_failed`);
  }

  await audit({
    entityType: "booking",
    entityId: request.bookingId,
    action: "reschedule_approved",
    userId: session.sub,
    userRole: "admin",
    newState: {
      originalLegId: request.originalLegId,
      requestedLegId: request.requestedLegId,
      seatCount,
    },
  });

  redirect("/admin/reschedules?ok=approved");
}

async function rejectAction(formData: FormData) {
  "use server";
  const session = await requireAdmin();
  const requestId = String(formData.get("requestId"));
  const adminNote = String(formData.get("adminNote") ?? "").trim() || null;
  if (!requestId) redirect("/admin/reschedules");

  const request = await prisma.rescheduleRequest.findUnique({
    where: { id: requestId },
  });
  if (!request || request.status !== "PENDING") {
    redirect("/admin/reschedules?error=not_pending");
  }

  await prisma.rescheduleRequest.update({
    where: { id: requestId },
    data: {
      status: "REJECTED",
      processedBy: session.sub,
      processedAt: new Date(),
      adminNote,
    },
  });

  await audit({
    entityType: "booking",
    entityId: request.bookingId,
    action: "reschedule_rejected",
    userId: session.sub,
    userRole: "admin",
    newState: { reason: adminNote },
  });

  redirect("/admin/reschedules?ok=rejected");
}

export default async function AdminReschedulesPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  await requireAdmin();
  const { ok, error } = await searchParams;

  const pending = await prisma.rescheduleRequest.findMany({
    where: { status: "PENDING" },
    include: {
      booking: true,
      originalLeg: { include: { schedule: true } },
      requestedLeg: { include: { schedule: { include: { boat: true } } } },
    },
    orderBy: { createdAt: "asc" },
  });

  const recentDecisions = await prisma.rescheduleRequest.findMany({
    where: { status: { in: ["APPROVED", "REJECTED"] } },
    include: {
      booking: true,
      requestedLeg: { include: { schedule: true } },
    },
    orderBy: { processedAt: "desc" },
    take: 20,
  });

  return (
    <div className="container py-8">
      <div className="mb-6 flex items-baseline justify-between">
        <h1 className="text-2xl font-bold tracking-tight">
          Reschedule requests
        </h1>
        <Link href="/admin" className="text-sm text-sky-700 hover:underline">
          ← Admin home
        </Link>
      </div>

      {ok ? (
        <p className="mb-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Request {ok}.
        </p>
      ) : null}
      {error ? (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error.replace(/_/g, " ")}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Pending ({pending.length})</CardTitle>
          <CardDescription>
            Approve to move the booking to the requested leg; reject to leave
            it where it is.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {pending.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No pending requests.
            </p>
          ) : null}
          {pending.map((r) => (
            <div key={r.id} className="rounded-md border bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-semibold">
                    {r.booking.bookingReference} · {r.booking.customerName}
                  </div>
                  <div className="mt-1 text-sm">
                    <span className="text-muted-foreground">From:</span>{" "}
                    {formatLocalDate(r.originalLeg.departureDate, "dd MMM")} ·{" "}
                    {formatLocalTime(r.originalLeg.departureDate)} →{" "}
                    <span className="font-medium text-slate-900">
                      {formatLocalDate(r.requestedLeg.departureDate, "dd MMM")}{" "}
                      ·{" "}
                      {formatLocalTime(r.requestedLeg.departureDate)} on{" "}
                      {r.requestedLeg.schedule.boat.name}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {r.originalLeg.schedule.originPort} →{" "}
                    {r.originalLeg.schedule.destinationPort} ·{" "}
                    {r.requestedLeg.availableSeats} seats on requested leg
                  </div>
                  {r.customerNote ? (
                    <p className="mt-2 text-xs italic text-slate-700">
                      &ldquo;{r.customerNote}&rdquo;
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-end gap-2">
                <form action={approveAction} className="flex flex-1 items-end gap-2">
                  <input type="hidden" name="requestId" value={r.id} />
                  <div className="flex-1">
                    <Textarea
                      name="adminNote"
                      rows={1}
                      placeholder="Optional note"
                    />
                  </div>
                  <Button type="submit" size="sm">
                    Approve
                  </Button>
                </form>
                <form action={rejectAction}>
                  <input type="hidden" name="requestId" value={r.id} />
                  <input
                    type="hidden"
                    name="adminNote"
                    value="Rejected by admin"
                  />
                  <Button type="submit" size="sm" variant="destructive">
                    Reject
                  </Button>
                </form>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {recentDecisions.length > 0 ? (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Recent decisions</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Booking</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Moved to</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Processed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentDecisions.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">
                      {r.booking.bookingReference}
                    </TableCell>
                    <TableCell>{r.booking.customerName}</TableCell>
                    <TableCell>
                      {formatLocalDate(r.requestedLeg.departureDate, "dd MMM")}{" "}
                      · {formatLocalTime(r.requestedLeg.departureDate)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          r.status === "APPROVED" ? "success" : "destructive"
                        }
                      >
                        {r.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {r.processedAt
                        ? formatLocalDate(r.processedAt, "dd MMM HH:mm")
                        : "-"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
