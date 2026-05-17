import Link from "next/link";
import { redirect } from "next/navigation";
import { requireOperator } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getOperatorLegs } from "@/lib/operator-data";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatLocalDate, formatLocalTime } from "@/lib/datetime";

export default async function OperatorDashboardPage() {
  const session = await requireOperator();
  const operator = await prisma.operator.findUnique({
    where: { id: session.sub },
    include: { _count: { select: { boats: true } } },
  });
  if (!operator) redirect("/operator/login");

  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setUTCHours(0, 0, 0, 0);
  const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

  const [todayLegs, upcomingLegs, scheduleCount] = await Promise.all([
    getOperatorLegs(session.sub, {
      fromUtc: startOfDay,
      toUtc: endOfDay,
      take: 20,
    }),
    getOperatorLegs(session.sub, {
      fromUtc: endOfDay,
      toUtc: new Date(endOfDay.getTime() + 7 * 24 * 60 * 60 * 1000),
      take: 20,
    }),
    prisma.schedule.count({
      where: { boat: { operatorId: session.sub }, status: "ACTIVE" },
    }),
  ]);

  const todayBooked = todayLegs.reduce(
    (acc, l) => acc + (l.totalCapacity - l.availableSeats),
    0,
  );
  const todayCapacity = todayLegs.reduce(
    (acc, l) => acc + l.totalCapacity,
    0,
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Welcome, {operator.contactPerson}
        </h1>
        <p className="text-sm text-muted-foreground">{operator.companyName}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Today&apos;s departures</CardDescription>
            <CardTitle className="text-3xl">{todayLegs.length}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {todayBooked}/{todayCapacity} seats booked
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Next 7 days</CardDescription>
            <CardTitle className="text-3xl">{upcomingLegs.length}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            generated departures
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Active schedules</CardDescription>
            <CardTitle className="text-3xl">{scheduleCount}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            <Link href="/operator/schedules" className="underline">
              Manage
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Your boats</CardDescription>
            <CardTitle className="text-3xl">{operator._count.boats}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            <Link href="/operator/boats" className="underline">
              Manage
            </Link>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <CardTitle>Today&apos;s departures</CardTitle>
              <CardDescription>
                Open the scanner at the dock to check passengers in.
              </CardDescription>
            </div>
            <Button asChild>
              <Link href="/operator/scanner">Open scanner</Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {todayLegs.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nothing scheduled for today.
            </p>
          ) : (
            <ul className="divide-y">
              {todayLegs.map((leg) => (
                <li
                  key={leg.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-3"
                >
                  <div>
                    <div className="font-medium">
                      <span className="font-mono">
                        {formatLocalTime(leg.departureDate)}
                      </span>{" "}
                      · {leg.schedule.originPort} →{" "}
                      {leg.schedule.destinationPort}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {leg.schedule.boat.name} ·{" "}
                      {leg.totalCapacity - leg.availableSeats}/
                      {leg.totalCapacity} booked
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={
                        leg.status === "CANCELLED"
                          ? "destructive"
                          : leg.status === "SAILED"
                            ? "secondary"
                            : "outline"
                      }
                    >
                      {leg.status}
                    </Badge>
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/operator/legs/${leg.id}`}>Manifest</Link>
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Coming up</CardTitle>
          <CardDescription>Next 7 days.</CardDescription>
        </CardHeader>
        <CardContent>
          {upcomingLegs.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No upcoming departures generated yet.
            </p>
          ) : (
            <ul className="divide-y">
              {upcomingLegs.slice(0, 10).map((leg) => (
                <li
                  key={leg.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
                >
                  <div>
                    <span className="font-mono text-xs text-muted-foreground">
                      {formatLocalDate(leg.departureDate)}{" "}
                      {formatLocalTime(leg.departureDate)}
                    </span>{" "}
                    · {leg.schedule.originPort} →{" "}
                    {leg.schedule.destinationPort}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {leg.totalCapacity - leg.availableSeats}/{leg.totalCapacity}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
