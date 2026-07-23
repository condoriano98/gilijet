import Link from "next/link";
import { notFound } from "next/navigation";
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
import { Button } from "@/components/ui/button";
import { formatIDR } from "@/lib/utils";
import { formatLocalDateTime } from "@/lib/datetime";
import { updateCoupon } from "../../actions";
import { CouponFields } from "../coupon-fields";

export const metadata = { title: "Edit coupon · Owner Console" };

export default async function EditCouponPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  await requireSuperAdmin();
  const { id } = await params;
  const { error } = await searchParams;

  const promo = await prisma.promotion.findUnique({
    where: { id },
    include: {
      redemptions: { orderBy: { createdAt: "desc" }, take: 50 },
      _count: { select: { redemptions: true } },
    },
  });
  if (!promo) notFound();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-mono text-lg font-semibold">{promo.code}</h2>
        <Link href="/admin/console/coupons" className="text-sm text-muted-foreground hover:underline">
          ← Back to coupons
        </Link>
      </div>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Settings</CardTitle>
          <CardDescription>
            Used {promo.usedCount} time{promo.usedCount === 1 ? "" : "s"}
            {promo.budgetCap != null
              ? ` · ${formatIDR(Number(promo.budgetSpent))} of ${formatIDR(Number(promo.budgetCap))} budget spent`
              : ""}
            .
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={updateCoupon} className="grid gap-5">
            <input type="hidden" name="id" value={promo.id} />
            <CouponFields promo={promo} editing />
            <div className="flex justify-end gap-3">
              <Button asChild variant="ghost">
                <Link href="/admin/console/coupons">Cancel</Link>
              </Button>
              <Button type="submit">Save changes</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Redemptions ({promo._count.redemptions})</CardTitle>
          <CardDescription>Most recent 50.</CardDescription>
        </CardHeader>
        <CardContent>
          {promo.redemptions.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No redemptions yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead className="text-right">Discount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {promo.redemptions.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs">{formatLocalDateTime(r.createdAt)}</TableCell>
                    <TableCell className="text-sm">{r.customerEmail}</TableCell>
                    <TableCell className="text-right">{formatIDR(Number(r.amount))}</TableCell>
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
