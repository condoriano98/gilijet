import Link from "next/link";
import { requireOperator } from "@/lib/auth";
import { getOperatorSchedules } from "@/lib/operator-data";
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
import { formatIDR } from "@/lib/utils";

const DAY_LABEL: Record<number, string> = {
  1: "M",
  2: "T",
  3: "W",
  4: "T",
  5: "F",
  6: "S",
  7: "S",
};

export default async function OperatorSchedulesPage() {
  const session = await requireOperator();
  const schedules = await getOperatorSchedules(session.sub);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Schedules</h1>
          <p className="text-sm text-muted-foreground">
            Recurring routes. Each schedule generates concrete departures
            (legs) for the next 14 days.
          </p>
        </div>
        <Button asChild>
          <Link href="/operator/schedules/new">New schedule</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {schedules.length.toLocaleString()} schedule
            {schedules.length === 1 ? "" : "s"}
          </CardTitle>
          <CardDescription>
            Only active schedules generate new legs.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {schedules.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No schedules yet — add your first route.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Route</TableHead>
                  <TableHead>Boat</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>Days</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Departures</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {schedules.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>
                      <div className="font-medium">
                        {s.originPort} → {s.destinationPort}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {s.durationMinutes} min
                      </div>
                    </TableCell>
                    <TableCell>{s.boat.name}</TableCell>
                    <TableCell className="font-mono">{s.departureTime}</TableCell>
                    <TableCell>
                      <div className="flex gap-0.5 font-mono text-xs">
                        {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                          <span
                            key={d}
                            className={
                              s.daysOfWeek.includes(d)
                                ? "rounded bg-sky-100 px-1 text-sky-700"
                                : "rounded bg-slate-100 px-1 text-slate-300"
                            }
                          >
                            {DAY_LABEL[d]}
                          </span>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>{formatIDR(Number(s.basePrice))}</TableCell>
                    <TableCell>{s._count.legs}</TableCell>
                    <TableCell>
                      <Badge variant={s.status === "ACTIVE" ? "success" : "outline"}>
                        {s.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/operator/schedules/${s.id}`}>Manage</Link>
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
