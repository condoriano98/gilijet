import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatIDR } from "@/lib/utils";

export default async function AdminOverviewPage() {
  await requireAdmin();

  const [
    pendingOperators,
    activeOperators,
    totalBoats,
    confirmedBookings,
    revenueAgg,
  ] = await Promise.all([
    prisma.operator.count({ where: { status: "PENDING" } }),
    prisma.operator.count({ where: { status: "ACTIVE" } }),
    prisma.boat.count(),
    prisma.booking.count({ where: { status: "CONFIRMED" } }),
    prisma.booking.aggregate({
      where: { status: "CONFIRMED" },
      _sum: { commissionAmount: true },
    }),
  ]);

  const tiles = [
    {
      label: "Pending operators",
      value: pendingOperators.toLocaleString(),
      href: "/admin/operators?status=PENDING",
      hint: "Awaiting verification",
    },
    {
      label: "Active operators",
      value: activeOperators.toLocaleString(),
      href: "/admin/operators?status=ACTIVE",
      hint: "Onboarded",
    },
    {
      label: "Boats on platform",
      value: totalBoats.toLocaleString(),
      href: "/admin/operators",
      hint: "Across all operators",
    },
    {
      label: "Confirmed bookings",
      value: confirmedBookings.toLocaleString(),
      href: "/admin/bookings",
      hint: "All-time",
    },
    {
      label: "Commission earned",
      value: formatIDR(Number(revenueAgg._sum.commissionAmount ?? 0)),
      href: "/admin/bookings",
      hint: "All-time, IDR",
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Overview</h1>
        <p className="text-sm text-muted-foreground">
          Platform-wide health at a glance.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((t) => (
          <Link key={t.label} href={t.href}>
            <Card className="transition-colors hover:bg-accent">
              <CardHeader className="pb-2">
                <CardDescription>{t.label}</CardDescription>
                <CardTitle className="text-3xl">{t.value}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">{t.hint}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
