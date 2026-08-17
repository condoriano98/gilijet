import Link from "next/link";
import { Prisma, BookingStatus } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
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
import { formatIDR } from "@/lib/utils";
import { formatLocalDateTime } from "@/lib/datetime";

const STATUS_FILTERS: BookingStatus[] = [
  "PENDING_PAYMENT",
  "AWAITING_CONFIRMATION",
  "CONFIRMED",
  "CANCELLED_BY_CUSTOMER",
  "CANCELLED_BY_OPERATOR",
  "EXPIRED",
];

function buildWhere(q?: string, status?: string): Prisma.BookingWhereInput {
  const where: Prisma.BookingWhereInput = {};
  if (status && STATUS_FILTERS.includes(status as BookingStatus)) {
    where.status = status as BookingStatus;
  }
  if (q && q.trim()) {
    const term = q.trim();
    where.OR = [
      { bookingReference: { contains: term, mode: "insensitive" } },
      { customerEmail: { contains: term, mode: "insensitive" } },
      { customerName: { contains: term, mode: "insensitive" } },
    ];
  }
  return where;
}

export default async function AdminBookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  await requireAdmin();
  const { q, status } = await searchParams;

  const where = buildWhere(q, status);
  const bookings = await prisma.booking.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      leg: { include: { schedule: { include: { boat: true } } } },
    },
  });

  const csvParams = new URLSearchParams();
  if (q) csvParams.set("q", q);
  if (status) csvParams.set("status", status);
  const csvHref = `/api/admin/bookings/csv${csvParams.toString() ? `?${csvParams}` : ""}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Bookings</h1>
          <p className="text-sm text-muted-foreground">
            Search by reference, email, or name. Up to 200 results shown.
          </p>
        </div>
        <Button asChild variant="outline">
          <a href={csvHref} download>
            Export CSV
          </a>
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          <form method="get" className="flex flex-wrap items-center gap-2">
            <Input
              name="q"
              placeholder="Reference, email, or name…"
              defaultValue={q ?? ""}
              className="max-w-xs"
            />
            {status ? <input type="hidden" name="status" value={status} /> : null}
            <Button type="submit">Search</Button>
            {(q || status) && (
              <Button asChild variant="ghost">
                <Link href="/admin/bookings">Clear</Link>
              </Button>
            )}
          </form>

          <div className="mt-3 flex flex-wrap gap-2">
            <FilterChip label="All" active={!status} href={q ? `/admin/bookings?q=${encodeURIComponent(q)}` : "/admin/bookings"} />
            {STATUS_FILTERS.map((s) => {
              const params = new URLSearchParams();
              if (q) params.set("q", q);
              params.set("status", s);
              return (
                <FilterChip
                  key={s}
                  label={s.replace(/_/g, " ")}
                  active={status === s}
                  href={`/admin/bookings?${params}`}
                />
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Results</CardTitle>
          <CardDescription>
            {bookings.length === 0
              ? "No bookings match your filters."
              : `${bookings.length} booking${bookings.length === 1 ? "" : "s"}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {bookings.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              Nothing here yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reference</TableHead>
                  <TableHead>Route</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bookings.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-mono text-xs">
                      <Link
                        href={`/b/${b.bookingReference}`}
                        className="hover:underline"
                        target="_blank"
                      >
                        {b.bookingReference}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {b.leg.schedule.originPort} → {b.leg.schedule.destinationPort}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {b.leg.schedule.boat.name} ·{" "}
                        {formatLocalDateTime(b.leg.departureDate)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">{b.customerName}</div>
                      <div className="text-xs text-muted-foreground">
                        {b.customerEmail}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{b.customerPhone}</TableCell>
                    <TableCell>{formatIDR(Number(b.totalAmount))}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{b.status.replace(/_/g, " ")}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatLocalDateTime(b.createdAt)}
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

function FilterChip({
  label,
  active,
  href,
}: {
  label: string;
  active: boolean;
  href: string;
}) {
  return (
    <Link
      href={href}
      className={[
        "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "border-sky-500 bg-sky-50 text-sky-700"
          : "border-slate-200 text-slate-600 hover:border-slate-300",
      ].join(" ")}
    >
      {label}
    </Link>
  );
}
