import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/auth";
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

export const metadata = { title: "Schedules · Operations" };

const DAY_LABELS = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const selectClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

export default async function OperationsSchedulesPage({
  searchParams,
}: {
  searchParams: Promise<{ operatorId?: string; ok?: string }>;
}) {
  await requireSuperAdmin();
  const { operatorId, ok } = await searchParams;

  const [operators, schedules] = await Promise.all([
    prisma.operator.findMany({
      where: { deletedAt: null },
      orderBy: { companyName: "asc" },
      select: { id: true, companyName: true },
    }),
    prisma.schedule.findMany({
      where: {
        deletedAt: null,
        boat: {
          deletedAt: null,
          ...(operatorId ? { operatorId } : {}),
        },
      },
      orderBy: [{ originPort: "asc" }, { departureTime: "asc" }],
      select: {
        id: true,
        originPort: true,
        destinationPort: true,
        departureTime: true,
        basePrice: true,
        daysOfWeek: true,
        status: true,
        boat: {
          select: {
            name: true,
            capacity: true,
            operator: { select: { id: true, companyName: true } },
          },
        },
        _count: { select: { legs: true } },
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
        <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle>Schedules ({schedules.length})</CardTitle>
            <CardDescription>
              Recurring routes. Departures are generated from these.
            </CardDescription>
          </div>
          <Button asChild>
            <Link href="/admin/operations/schedules/new">New schedule</Link>
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <form className="flex items-end gap-2">
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
          </form>

          {schedules.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No schedules yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Route</TableHead>
                  <TableHead>Operator</TableHead>
                  <TableHead>Boat</TableHead>
                  <TableHead>Departs</TableHead>
                  <TableHead>Days</TableHead>
                  <TableHead className="text-right">Fare</TableHead>
                  <TableHead className="text-right">Departures</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {schedules.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/admin/operations/schedules/${s.id}`}
                        className="hover:underline"
                      >
                        {s.originPort} → {s.destinationPort}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm">
                      {s.boat.operator.companyName}
                    </TableCell>
                    <TableCell className="text-sm">
                      {s.boat.name}{" "}
                      <span className="text-muted-foreground">
                        ({s.boat.capacity})
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {s.departureTime}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {[...s.daysOfWeek]
                        .sort((a, b) => a - b)
                        .map((d) => DAY_LABELS[d])
                        .join(" ")}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {Number(s.basePrice).toLocaleString("id-ID")}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {s._count.legs}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={s.status === "ACTIVE" ? "success" : "outline"}
                      >
                        {s.status}
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
