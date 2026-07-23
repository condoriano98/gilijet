import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/auth";
import { KpiCard } from "@/components/ui/kpi-card";
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
import { formatIDR } from "@/lib/utils";

export const metadata = { title: "Overview · Owner Console" };

export default async function ConsoleOverviewPage() {
  await requireSuperAdmin();

  const [gmvAgg, commissionAgg, discountAgg, redemptionCount, activeCoupons, topSpend] =
    await Promise.all([
      prisma.booking.aggregate({
        where: { status: "CONFIRMED" },
        _sum: { totalAmount: true },
      }),
      prisma.booking.aggregate({
        where: { status: "CONFIRMED" },
        _sum: { commissionAmount: true },
      }),
      prisma.promotionRedemption.aggregate({ _sum: { amount: true } }),
      prisma.promotionRedemption.count(),
      prisma.promotion.count({ where: { isActive: true, archivedAt: null } }),
      prisma.promotionRedemption.groupBy({
        by: ["promotionId"],
        _sum: { amount: true },
        _count: { _all: true },
        orderBy: { _sum: { amount: "desc" } },
        take: 5,
      }),
    ]);

  const gmv = Number(gmvAgg._sum.totalAmount ?? 0);
  const commission = Number(commissionAgg._sum.commissionAmount ?? 0);
  const discountSpend = Number(discountAgg._sum.amount ?? 0);
  const takeRate = gmv > 0 ? (commission / gmv) * 100 : 0;

  const topPromos = topSpend.length
    ? await prisma.promotion.findMany({
        where: { id: { in: topSpend.map((t) => t.promotionId) } },
        select: { id: true, code: true },
      })
    : [];
  const codeById = new Map(topPromos.map((p) => [p.id, p.code]));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="GMV (confirmed)" value={formatIDR(gmv)} accent="blue" />
        <KpiCard
          label="Effective take-rate"
          value={`${takeRate.toFixed(1)}%`}
          hint={`${formatIDR(commission)} commission`}
          accent="green"
        />
        <KpiCard
          label="Discount spend"
          value={formatIDR(discountSpend)}
          hint={`${redemptionCount} redemptions`}
          accent="orange"
        />
        <KpiCard label="Active coupons" value={String(activeCoupons)} accent="blue" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Top coupons by spend</CardTitle>
          <CardDescription>Where the discount budget is going.</CardDescription>
        </CardHeader>
        <CardContent>
          {topSpend.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No redemptions yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead className="text-right">Redemptions</TableHead>
                  <TableHead className="text-right">Discount spend</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topSpend.map((t) => (
                  <TableRow key={t.promotionId}>
                    <TableCell>
                      <Link
                        href={`/admin/console/coupons/${t.promotionId}`}
                        className="font-mono font-semibold text-sky-700 hover:underline"
                      >
                        {codeById.get(t.promotionId) ?? t.promotionId}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right">{t._count._all}</TableCell>
                    <TableCell className="text-right">
                      {formatIDR(Number(t._sum.amount ?? 0))}
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
