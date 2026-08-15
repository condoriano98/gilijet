import Link from "next/link";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/auth";
import { formatLocalDateTime, localDateTimeToUtc } from "@/lib/datetime";
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

export const metadata = { title: "Departures · Operations" };

const selectClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

/** WITA day bounds for a YYYY-MM-DD, or undefined when blank/invalid. */
function witaDay(ymd?: string): { gte: Date; lte: Date } | undefined {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return undefined;
  return {
    gte: localDateTimeToUtc(ymd, "00:00"),
    lte: localDateTimeToUtc(ymd, "23:59"),
  };
}

export default async function OperationsDeparturesPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; operatorId?: string; ok?: string }>;
}) {
  await requireSuperAdmin();
  const { date, operatorId, ok } = await searchParams;

  const day = witaDay(date);
  const where: Prisma.LegWhereInput = {
    ...(day ? { departureDate: day } : { departureDate: { gte: new Date() } }),
    ...(operatorId ? { operatorId } : {}),
  };

  const [operators, legs] = await Promise.all([
    prisma.operator.findMany({
      where: { deletedAt: null },
      orderBy: { companyName: "asc" },
      select: { id: true, companyName: true },
    }),
    prisma.leg.findMany({
      where,
      orderBy: { departureDate: "asc" },
      take: 100,
      select: {
        id: true,
        departureDate: true,
        status: true,
        operator: { select: { companyName: true } },
        schedule: {
          select: { originPort: true, destinationPort: true, boat: { select: { name: true } } },
        },
        _count: { select: { bookings: true } },
      },
    }),
  ]);

  return (
    <div className="space-y-6">
      {ok ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
          Saved.
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Departures</CardTitle>
          <CardDescription>
            {day
              ? "Sailings on the selected day."
              : "Upcoming sailings across all operators, soonest first."}{" "}
            Times are WITA.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form className="flex flex-wrap items-end gap-2">
            <div className="grid gap-1.5">
              <label htmlFor="date" className="text-sm font-medium">
                Date
              </label>
              <Input
                id="date"
                name="date"
                type="date"
                defaultValue={date ?? ""}
                className="w-44"
              />
            </div>
            <div className="grid w-64 gap-1.5">
              <label htmlFor="operatorId" className="text-sm font-medium">
                Operator
              </label>
              <select
                id="operatorId"
                name="operatorId"
                defaultValue={operatorId ?? ""}
                className={selectClass}
              >
                <option value="">All operators</option>
                {operators.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.companyName}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" variant="outline">
              Filter
            </Button>
            {date || operatorId ? (
              <Button variant="ghost" asChild>
                <Link href="/admin/operations">Clear</Link>
              </Button>
            ) : null}
          </form>

          {legs.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No departures match. If a schedule has none at all, open it and use
              Generate departures.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Departure</TableHead>
                  <TableHead>Route</TableHead>
                  <TableHead>Operator</TableHead>
                  <TableHead>Boat</TableHead>
                  <TableHead className="text-right">Bookings</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {legs.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="whitespace-nowrap text-sm">
                      {formatLocalDateTime(l.departureDate)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {l.schedule.originPort} → {l.schedule.destinationPort}
                    </TableCell>
                    <TableCell className="text-sm">
                      {l.operator.companyName}
                    </TableCell>
                    <TableCell className="text-sm">
                      {l.schedule.boat.name}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {l._count.bookings}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          l.status === "OPEN"
                            ? "success"
                            : l.status === "CANCELLED"
                              ? "destructive"
                              : "outline"
                        }
                      >
                        {l.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Link
                        href={`/admin/operations/departures/${l.id}`}
                        className="text-sm text-sky-700 hover:underline"
                      >
                        Manage
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {legs.length === 100 ? (
            <p className="text-xs text-muted-foreground">
              Showing the first 100 — narrow by date or operator to see more.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
