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

  const startOfWeek = new Date(startOfDay);
  startOfWeek.setUTCDate(startOfWeek.getUTCDate() - 6);
  const startOfMonth = new Date(startOfDay);
  startOfMonth.setUTCDate(1);
  const start14d = new Date(startOfDay.getTime() - 13 * 24 * 60 * 60 * 1000);

  const [
    todayLegs,
    upcomingLegs,
    scheduleCount,
    todayRevenue,
    weekRevenue,
    monthRevenue,
    pendingPayout,
    recentPayments,
    monthBookings,
  ] = await Promise.all([
    getOperatorLegs(session.sub, { fromUtc: startOfDay, toUtc: endOfDay, take: 20 }),
    getOperatorLegs(session.sub, {
      fromUtc: endOfDay,
      toUtc: new Date(endOfDay.getTime() + 7 * 24 * 60 * 60 * 1000),
      take: 20,
    }),
    prisma.schedule.count({
      where: { boat: { operatorId: session.sub }, status: "ACTIVE" },
    }),
    prisma.booking.aggregate({
      where: {
        status: "CONFIRMED",
        leg: { schedule: { boat: { operatorId: session.sub } } },
        createdAt: { gte: startOfDay, lt: endOfDay },
      },
      _sum: { operatorAmount: true },
      _count: true,
    }),
    prisma.booking.aggregate({
      where: {
        status: "CONFIRMED",
        leg: { schedule: { boat: { operatorId: session.sub } } },
        createdAt: { gte: startOfWeek, lt: endOfDay },
      },
      _sum: { operatorAmount: true },
      _count: true,
    }),
    prisma.booking.aggregate({
      where: {
        status: "CONFIRMED",
        leg: { schedule: { boat: { operatorId: session.sub } } },
        createdAt: { gte: startOfMonth, lt: endOfDay },
      },
      _sum: { operatorAmount: true },
      _count: true,
    }),
    prisma.booking.aggregate({
      where: {
        status: "CONFIRMED",
        leg: {
          schedule: { boat: { operatorId: session.sub } },
          departureDate: { lt: now },
        },
      },
      _sum: { operatorAmount: true },
      _count: true,
    }),
    // 14-day daily revenue (for chart)
    prisma.payment.findMany({
      where: {
        status: "SUCCESSFUL",
        paidAt: { gte: start14d },
        booking: { leg: { schedule: { boat: { operatorId: session.sub } } } },
      },
      select: { paidAt: true, amount: true },
    }),
    // Month bookings for top routes
    prisma.booking.findMany({
      where: {
        status: "CONFIRMED",
        leg: { schedule: { boat: { operatorId: session.sub } } },
        createdAt: { gte: startOfMonth, lt: endOfDay },
      },
      select: {
        operatorAmount: true,
        leg: { select: { schedule: { select: { originPort: true, destinationPort: true } } } },
      },
    }),
  ]);

  const todayBooked = todayLegs.reduce((acc, l) => acc + (l.totalCapacity - l.availableSeats), 0);
  const todayCapacity = todayLegs.reduce((acc, l) => acc + l.totalCapacity, 0);

  // Upcoming occupancy
  const upcomingBooked = upcomingLegs.reduce((acc, l) => acc + (l.totalCapacity - l.availableSeats), 0);
  const upcomingCapacity = upcomingLegs.reduce((acc, l) => acc + l.totalCapacity, 0);
  const occupancyPct = upcomingCapacity > 0 ? Math.round((upcomingBooked / upcomingCapacity) * 100) : 0;

  // Build 14-day revenue chart data
  const dailyMap = new Map<string, number>();
  for (let i = 0; i < 14; i++) {
    const d = new Date(start14d.getTime() + i * 24 * 60 * 60 * 1000);
    dailyMap.set(d.toISOString().slice(0, 10), 0);
  }
  for (const p of recentPayments) {
    if (!p.paidAt) continue;
    const key = p.paidAt.toISOString().slice(0, 10);
    if (dailyMap.has(key)) {
      dailyMap.set(key, (dailyMap.get(key) ?? 0) + Number(p.amount));
    }
  }
  const chartDays = Array.from(dailyMap.entries()).map(([dateStr, revenue]) => ({
    dateStr,
    revenue,
    label: new Date(dateStr + "T00:00:00Z").toLocaleDateString("en-ID", {
      timeZone: "UTC",
      month: "short",
      day: "numeric",
    }),
  }));
  const maxRevenue = Math.max(...chartDays.map((d) => d.revenue), 1);

  // Top routes this month
  const routeMap = new Map<string, { count: number; total: number }>();
  for (const b of monthBookings) {
    const key = `${b.leg.schedule.originPort} → ${b.leg.schedule.destinationPort}`;
    const prev = routeMap.get(key) ?? { count: 0, total: 0 };
    routeMap.set(key, {
      count: prev.count + 1,
      total: prev.total + Number(b.operatorAmount),
    });
  }
  const topRoutes = Array.from(routeMap.entries())
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 5);
  const maxRouteTotal = Math.max(...topRoutes.map((r) => r[1].total), 1);

  const formatRupiah = (v: number) => `IDR ${Math.round(v).toLocaleString("id-ID")}`;

  const CHART_W = 308;
  const CHART_H = 80;
  const barWidth = 18;
  const barGap = 4;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Welcome, {operator.contactPerson}
        </h1>
        <p className="text-sm text-muted-foreground">{operator.companyName}</p>
      </div>

      {/* Revenue at a glance */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Today&apos;s earnings</CardDescription>
            <CardTitle className="text-2xl">
              {formatRupiah(Number(todayRevenue._sum.operatorAmount ?? 0))}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {todayRevenue._count} confirmed booking{todayRevenue._count === 1 ? "" : "s"}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Last 7 days</CardDescription>
            <CardTitle className="text-2xl">
              {formatRupiah(Number(weekRevenue._sum.operatorAmount ?? 0))}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {weekRevenue._count} confirmed
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Month to date</CardDescription>
            <CardTitle className="text-2xl">
              {formatRupiah(Number(monthRevenue._sum.operatorAmount ?? 0))}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {monthRevenue._count} confirmed
          </CardContent>
        </Card>
        <Card className="border-amber-200 bg-amber-50">
          <CardHeader className="pb-2">
            <CardDescription>Pending payout</CardDescription>
            <CardTitle className="text-2xl">
              {formatRupiah(Number(pendingPayout._sum.operatorAmount ?? 0))}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Settles weekly · {pendingPayout._count} trip{pendingPayout._count === 1 ? "" : "s"}
          </CardContent>
        </Card>
      </div>

      {/* Operations */}
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
            <CardDescription>Next 7 days occupancy</CardDescription>
            <CardTitle className="text-3xl">{occupancyPct}%</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {upcomingBooked}/{upcomingCapacity} seats booked
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
            {" · "}
            <Link href="/operator/boats" className="underline">
              {operator._count.boats} boat{operator._count.boats === 1 ? "" : "s"}
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Revenue chart */}
      <Card>
        <CardHeader>
          <CardTitle>Revenue — last 14 days</CardTitle>
          <CardDescription>Your share after platform commission</CardDescription>
        </CardHeader>
        <CardContent>
          {maxRevenue <= 1 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No payments received in the last 14 days.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <svg
                viewBox={`0 0 ${CHART_W} ${CHART_H + 24}`}
                width={CHART_W}
                height={CHART_H + 24}
                aria-label="14-day revenue chart"
              >
                {chartDays.map((d, i) => {
                  const barH = Math.max(
                    2,
                    Math.round((d.revenue / maxRevenue) * CHART_H),
                  );
                  const x = i * (barWidth + barGap);
                  const y = CHART_H - barH;
                  return (
                    <g key={d.dateStr}>
                      <rect
                        x={x}
                        y={y}
                        width={barWidth}
                        height={barH}
                        fill={d.revenue > 0 ? "#0ea5e9" : "#e2e8f0"}
                        rx={2}
                      >
                        <title>
                          {d.label}: {formatRupiah(d.revenue)}
                        </title>
                      </rect>
                      {i % 2 === 0 && (
                        <text
                          x={x + barWidth / 2}
                          y={CHART_H + 16}
                          fontSize={7}
                          textAnchor="middle"
                          fill="#94a3b8"
                        >
                          {d.label}
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Top routes */}
      {topRoutes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Top routes this month</CardTitle>
            <CardDescription>By your earnings</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {topRoutes.map(([route, { count, total }]) => (
                <li key={route}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-medium">{route}</span>
                    <span className="text-muted-foreground text-xs">
                      {count} booking{count === 1 ? "" : "s"} · {formatRupiah(total)}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-100">
                    <div
                      className="h-1.5 rounded-full bg-sky-400"
                      style={{ width: `${Math.round((total / maxRouteTotal) * 100)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Today's departures */}
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
                      <span className="font-mono">{formatLocalTime(leg.departureDate)}</span>{" "}
                      · {leg.schedule.originPort} → {leg.schedule.destinationPort}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {leg.schedule.boat.name} ·{" "}
                      {leg.totalCapacity - leg.availableSeats}/{leg.totalCapacity} booked
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

      {/* Coming up */}
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
                    · {leg.schedule.originPort} → {leg.schedule.destinationPort}
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
