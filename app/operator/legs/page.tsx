import Link from "next/link";
import { LegStatus } from "@prisma/client";
import { requireOperator } from "@/lib/auth";
import { getOperatorLegs } from "@/lib/operator-data";
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

const STATUSES: LegStatus[] = ["OPEN", "FULL", "SAILED", "CANCELLED"];

function rangeFromKey(
  key: string,
): { fromUtc?: Date; toUtc?: Date; label: string } {
  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setUTCHours(0, 0, 0, 0);
  const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);
  switch (key) {
    case "today":
      return { fromUtc: startOfDay, toUtc: endOfDay, label: "Today" };
    case "upcoming":
      return { fromUtc: now, label: "Upcoming" };
    case "past":
      return { toUtc: now, label: "Past" };
    default:
      return { fromUtc: now, label: "Upcoming" };
  }
}

function statusVariant(s: LegStatus) {
  switch (s) {
    case "OPEN":
      return "success" as const;
    case "FULL":
      return "warning" as const;
    case "SAILED":
      return "secondary" as const;
    case "CANCELLED":
      return "destructive" as const;
  }
}

export default async function OperatorLegsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; status?: string }>;
}) {
  const session = await requireOperator();
  const { range = "upcoming", status } = await searchParams;
  const r = rangeFromKey(range);

  const legs = await getOperatorLegs(session.sub, {
    fromUtc: r.fromUtc,
    toUtc: r.toUtc,
    status: STATUSES.includes(status as LegStatus)
      ? (status as LegStatus)
      : undefined,
    take: 200,
  });

  const ranges = [
    { key: "today", label: "Today" },
    { key: "upcoming", label: "Upcoming" },
    { key: "past", label: "Past" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Departures</h1>
        <p className="text-sm text-muted-foreground">
          Every concrete leg generated from your schedules.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {ranges.map((rg) => (
          <Link key={rg.key} href={`/operator/legs?range=${rg.key}`}>
            <Badge variant={range === rg.key ? "default" : "outline"}>
              {rg.label}
            </Badge>
          </Link>
        ))}
        <span className="mx-2 h-4 w-px bg-border" />
        <Link href={`/operator/legs?range=${range}`}>
          <Badge variant={!status ? "default" : "outline"}>All</Badge>
        </Link>
        {STATUSES.map((s) => (
          <Link
            key={s}
            href={`/operator/legs?range=${range}&status=${s}`}
          >
            <Badge variant={status === s ? "default" : "outline"}>{s}</Badge>
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {r.label} {status ? `· ${status}` : ""}
          </CardTitle>
          <CardDescription>
            {legs.length} departure{legs.length === 1 ? "" : "s"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {legs.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No departures match this filter.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>Route</TableHead>
                  <TableHead>Boat</TableHead>
                  <TableHead>Seats</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {legs.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell>{formatLocalDate(l.departureDate)}</TableCell>
                    <TableCell className="font-mono">
                      {formatLocalTime(l.departureDate)}
                    </TableCell>
                    <TableCell>
                      {l.schedule.originPort} → {l.schedule.destinationPort}
                    </TableCell>
                    <TableCell>{l.schedule.boat.name}</TableCell>
                    <TableCell>
                      {l.totalCapacity - l.availableSeats}/{l.totalCapacity}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(l.status)}>
                        {l.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/operator/legs/${l.id}`}>Manifest</Link>
                      </Button>
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
