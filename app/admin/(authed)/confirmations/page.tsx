import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  issueTicketsForBooking,
  rejectBookingAvailability,
} from "@/lib/ticket-issuer";
import {
  notifyBoardingPassIssued,
  notifyOperatorUnavailable,
} from "@/lib/booking-notifications";
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
import { Input } from "@/components/ui/input";
import { formatDateTimeID, formatIDR } from "@/lib/utils";
import { formatLocalDateTime } from "@/lib/datetime";
import { normalizeWhatsappNumber } from "@/lib/whatsapp";

/**
 * The manual availability gate.
 *
 * Operators on this platform take bookings by phone and do not use the
 * dashboard, so a paid booking is not a promised seat until an admin has rung
 * them. This queue is where that call gets recorded: approving mints the
 * boarding pass and sends it, rejecting cancels and opens a full refund.
 */

async function approveAction(formData: FormData) {
  "use server";
  const session = await requireAdmin();
  const bookingId = String(formData.get("bookingId") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  if (!bookingId) redirect("/admin/confirmations");

  const result = await issueTicketsForBooking({
    bookingId,
    adminId: session.sub,
    note: note || null,
  });

  if (!result.alreadyIssued) {
    await notifyBoardingPassIssued(bookingId, result.tickets);
  }

  redirect(
    `/admin/confirmations?ok=${result.alreadyIssued ? "already" : "issued"}&ref=${result.bookingReference}`,
  );
}

async function rejectAction(formData: FormData) {
  "use server";
  const session = await requireAdmin();
  const bookingId = String(formData.get("bookingId") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  if (!bookingId) redirect("/admin/confirmations");

  const result = await rejectBookingAvailability({
    bookingId,
    adminId: session.sub,
    note: note || null,
  });

  if (!result.alreadyRejected) {
    await notifyOperatorUnavailable(bookingId, Number(result.refundAmount));
  }

  redirect(
    `/admin/confirmations?ok=rejected&ref=${result.bookingReference}`,
  );
}

export default async function AdminConfirmationsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; ref?: string }>;
}) {
  await requireAdmin();
  const { ok, ref } = await searchParams;

  const bookings = await prisma.booking.findMany({
    where: { status: "AWAITING_CONFIRMATION" },
    orderBy: [{ leg: { departureDate: "asc" } }, { createdAt: "asc" }],
    select: {
      id: true,
      bookingReference: true,
      customerName: true,
      customerPhone: true,
      customerEmail: true,
      totalAmount: true,
      createdAt: true,
      notes: true,
      operator: {
        select: { companyName: true, contactPerson: true, phoneNumber: true },
      },
      leg: {
        select: {
          departureDate: true,
          schedule: {
            select: {
              originPort: true,
              destinationPort: true,
              boat: { select: { name: true } },
            },
          },
        },
      },
    },
    take: 200,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Seat confirmations</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          These customers have paid. Call the operator to check the boat is
          running and has room, then approve to send the boarding pass, or
          reject to cancel and refund in full.
        </p>
      </div>

      {(ok === "issued" || ok === "already") && ref && (
        <Card
          className={
            ok === "issued"
              ? "border-emerald-200 bg-emerald-50"
              : "border-amber-200 bg-amber-50"
          }
        >
          <CardContent className="py-3 text-sm">
            {ok === "issued" ? (
              <>
                Boarding pass issued for <strong>{ref}</strong> and sent by
                email and WhatsApp.
              </>
            ) : (
              <>
                <strong>{ref}</strong> was already issued — nothing was sent
                twice.
              </>
            )}{" "}
            <a
              href={`/api/bookings/${ref}/boarding-pass`}
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              Open the PDF to send by hand
            </a>
            .
          </CardContent>
        </Card>
      )}
      {ok === "rejected" && (
        <Card className="border-rose-200 bg-rose-50">
          <CardContent className="py-3 text-sm text-rose-900">
            <strong>{ref}</strong> cancelled. A full refund is now pending in{" "}
            <Link href="/admin/refunds" className="underline">
              Refunds
            </Link>
            .
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Awaiting confirmation</CardTitle>
          <CardDescription>
            {bookings.length === 0
              ? "Nothing waiting — every paid booking has been confirmed."
              : `${bookings.length} paid booking(s) waiting on an operator call. Soonest departure first.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {bookings.length === 0 ? null : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Booking</TableHead>
                  <TableHead>Departure</TableHead>
                  <TableHead>Operator to call</TableHead>
                  <TableHead>Paid</TableHead>
                  <TableHead className="text-right">Decision</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bookings.map((b) => {
                  const operatorWa = normalizeWhatsappNumber(
                    b.operator.phoneNumber,
                  );
                  return (
                    <TableRow key={b.id}>
                      <TableCell className="align-top">
                        <Link
                          href={`/admin/bookings?q=${b.bookingReference}`}
                          className="font-medium underline"
                        >
                          {b.bookingReference}
                        </Link>
                        <div className="text-xs text-muted-foreground">
                          {b.customerName} · {passengerCount(b.notes)} pax
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {b.customerPhone}
                        </div>
                      </TableCell>
                      <TableCell className="align-top text-sm">
                        <div>{formatLocalDateTime(b.leg.departureDate)}</div>
                        <div className="text-xs text-muted-foreground">
                          {b.leg.schedule.originPort} →{" "}
                          {b.leg.schedule.destinationPort}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {b.leg.schedule.boat.name}
                        </div>
                      </TableCell>
                      <TableCell className="align-top text-sm">
                        <div>{b.operator.contactPerson}</div>
                        <div className="text-xs text-muted-foreground">
                          {b.operator.companyName}
                        </div>
                        {operatorWa ? (
                          <a
                            href={`https://wa.me/${operatorWa}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs underline"
                          >
                            {b.operator.phoneNumber}
                          </a>
                        ) : (
                          <div className="text-xs text-muted-foreground">
                            {b.operator.phoneNumber}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="align-top text-sm">
                        <div>{formatIDR(Number(b.totalAmount))}</div>
                        <Badge variant="warning" className="mt-1">
                          paid {formatDateTimeID(b.createdAt)}
                        </Badge>
                      </TableCell>
                      <TableCell className="align-top">
                        {/* One form, two formActions, so whichever way the
                            call went the same note is recorded against it. */}
                        <form className="flex flex-col items-end gap-2">
                          <input type="hidden" name="bookingId" value={b.id} />
                          <Input
                            name="note"
                            placeholder="Who confirmed, on what number"
                            className="h-8 text-xs"
                          />
                          <div className="flex gap-2">
                            <Button
                              type="submit"
                              formAction={approveAction}
                              size="sm"
                            >
                              Confirmed — send pass
                            </Button>
                            <Button
                              type="submit"
                              formAction={rejectAction}
                              size="sm"
                              variant="destructive"
                            >
                              Unavailable — refund
                            </Button>
                          </div>
                        </form>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function passengerCount(notes: string | null): number {
  if (!notes) return 0;
  try {
    const parsed = JSON.parse(notes) as { passengers?: unknown[] };
    return Array.isArray(parsed.passengers) ? parsed.passengers.length : 0;
  } catch {
    return 0;
  }
}
