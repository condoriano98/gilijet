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
import {
  regenerateDepartures,
  setScheduleStatus,
  updateSchedule,
  deleteSchedule,
} from "../../actions";
import { ScheduleFields } from "../../schedule-fields";

export const metadata = { title: "Schedule · Operations" };

export default async function OperationsScheduleDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; ok?: string; generated?: string }>;
}) {
  await requireSuperAdmin();
  const { id } = await params;
  const { error, ok, generated } = await searchParams;

  const schedule = await prisma.schedule.findFirst({
    where: { id, deletedAt: null },
    include: {
      boat: {
        select: {
          id: true,
          name: true,
          operatorId: true,
          operator: { select: { id: true, companyName: true } },
        },
      },
      legs: {
        where: { departureDate: { gte: new Date() } },
        orderBy: { departureDate: "asc" },
        take: 20,
        select: {
          id: true,
          departureDate: true,
          status: true,
          totalCapacity: true,
          availableSeats: true,
        },
      },
    },
  });
  if (!schedule) notFound();

  const [operators, boats] = await Promise.all([
    prisma.operator.findMany({
      where: { deletedAt: null },
      orderBy: { companyName: "asc" },
      select: { id: true, companyName: true },
    }),
    prisma.boat.findMany({
      where: { deletedAt: null, status: "ACTIVE", operatorId: schedule.boat.operatorId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, capacity: true, operatorId: true },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/admin/operations/schedules"
            className="text-sm text-muted-foreground hover:underline"
          >
            ← All schedules
          </Link>
          <h2 className="mt-1 text-xl font-bold tracking-tight">
            {schedule.originPort} → {schedule.destinationPort}
          </h2>
          <p className="text-sm text-muted-foreground">
            {schedule.boat.operator.companyName} · {schedule.boat.name}
          </p>
        </div>
        <Badge variant={schedule.status === "ACTIVE" ? "success" : "outline"}>
          {schedule.status}
        </Badge>
      </div>

      {ok ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
          Saved.
        </div>
      ) : null}
      {generated ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
          Generated {generated} new departure(s).
        </div>
      ) : null}
      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
          <CardDescription>
            Changing the time or days affects departures generated from now on;
            those already created keep their original time.
          </CardDescription>
        </CardHeader>
        <form action={updateSchedule}>
          <CardContent>
            <input type="hidden" name="id" value={schedule.id} />
            <ScheduleFields
              schedule={schedule}
              operators={operators}
              boats={boats}
              defaultOperatorId={schedule.boat.operatorId}
              editing
            />
          </CardContent>
          <CardFooter className="justify-end">
            <Button type="submit">Save changes</Button>
          </CardFooter>
        </form>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Availability</CardTitle>
            <CardDescription>
              Deactivating stops new departures being generated. Existing ones
              stay bookable until you cancel them individually.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={setScheduleStatus} className="flex gap-2">
              <input type="hidden" name="id" value={schedule.id} />
              <Button
                type="submit"
                name="next"
                value="ACTIVE"
                disabled={schedule.status === "ACTIVE"}
              >
                Activate
              </Button>
              <Button
                type="submit"
                name="next"
                value="INACTIVE"
                variant="outline"
                disabled={schedule.status === "INACTIVE"}
              >
                Deactivate
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Departures</CardTitle>
            <CardDescription>
              Top up the next 60 days now instead of waiting for the nightly
              job. Existing departures are left alone.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={regenerateDepartures}>
              <input type="hidden" name="id" value={schedule.id} />
              <Button type="submit" variant="outline">
                Generate departures
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <Card className="border-red-200">
        <CardHeader>
          <CardTitle>Delete schedule</CardTitle>
          <CardDescription>
            Removes this route from the operations list and from customer
            search, and closes its remaining future departures so no stale link
            can still sell one. Past departures and their bookings are kept —
            they are the record of money already taken. Refused while any
            upcoming departure still has bookings; cancel those first so the
            customers get refunded.
          </CardDescription>
        </CardHeader>
        <CardFooter className="justify-end">
          <form action={deleteSchedule}>
            <input type="hidden" name="id" value={schedule.id} />
            <Button type="submit" variant="destructive">
              Delete schedule
            </Button>
          </form>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Upcoming departures</CardTitle>
          <CardDescription>Next 20 from now.</CardDescription>
        </CardHeader>
        <CardContent>
          {schedule.legs.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              None yet — use Generate departures above.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Departure (WITA)</TableHead>
                  <TableHead>Seats</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {schedule.legs.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell>{formatLocalDateTime(l.departureDate)}</TableCell>
                    <TableCell className="text-sm">
                      {l.totalCapacity - l.availableSeats}/{l.totalCapacity} booked
                    </TableCell>
                    <TableCell>
                      <Badge variant={l.status === "OPEN" ? "success" : "outline"}>
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
        </CardContent>
      </Card>
    </div>
  );
}
