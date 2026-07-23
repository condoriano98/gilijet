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
import { formatIDR } from "@/lib/utils";
import { toggleCoupon, archiveCoupon } from "../actions";

export const metadata = { title: "Coupons · Owner Console" };

type Promo = Awaited<ReturnType<typeof prisma.promotion.findMany>>[number];

function status(p: Promo): { label: string; variant: "success" | "destructive" | "outline" | "secondary" } {
  const now = Date.now();
  if (p.archivedAt) return { label: "Archived", variant: "outline" };
  if (!p.isActive) return { label: "Inactive", variant: "outline" };
  if (p.startsAt && p.startsAt.getTime() > now) return { label: "Scheduled", variant: "secondary" };
  if (p.expiresAt && p.expiresAt.getTime() < now) return { label: "Expired", variant: "destructive" };
  if (p.maxUses != null && p.usedCount >= p.maxUses) return { label: "Exhausted", variant: "destructive" };
  if (p.budgetCap != null && Number(p.budgetSpent) >= Number(p.budgetCap)) return { label: "Budget spent", variant: "destructive" };
  return { label: "Active", variant: "success" };
}

export default async function CouponsPage({
  searchParams,
}: {
  searchParams: Promise<{ generated?: string }>;
}) {
  await requireSuperAdmin();
  const { generated } = await searchParams;

  const promos = await prisma.promotion.findMany({
    orderBy: [{ archivedAt: "asc" }, { createdAt: "desc" }],
  });

  return (
    <div className="space-y-6">
      {generated ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
          Generated {generated} coupon code{generated === "1" ? "" : "s"}.
        </div>
      ) : null}

      <div className="flex items-baseline justify-between">
        <div>
          <h2 className="text-lg font-semibold">Coupons</h2>
          <p className="text-sm text-muted-foreground">
            Discount codes, targeting, budgets and who absorbs the cost.
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/console/coupons/new">+ New coupon</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All coupons</CardTitle>
          <CardDescription>
            Deactivating or archiving stops new redemptions; past bookings are
            unaffected.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {promos.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No coupons yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Discount</TableHead>
                  <TableHead>Cost</TableHead>
                  <TableHead>Usage</TableHead>
                  <TableHead>Budget</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {promos.map((p) => {
                  const st = status(p);
                  return (
                    <TableRow key={p.id}>
                      <TableCell>
                        <Link
                          href={`/admin/console/coupons/${p.id}`}
                          className="font-mono font-semibold text-sky-700 hover:underline"
                        >
                          {p.code}
                        </Link>
                      </TableCell>
                      <TableCell>
                        {p.discountType === "PERCENT"
                          ? `${Number(p.discountValue)}%${p.maxDiscountAmount != null ? ` ≤${formatIDR(Number(p.maxDiscountAmount))}` : ""}`
                          : formatIDR(Number(p.discountValue))}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-normal">
                          {p.costBearer}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {p.usedCount}
                        {p.maxUses != null ? ` / ${p.maxUses}` : ""}
                      </TableCell>
                      <TableCell className="text-xs">
                        {p.budgetCap != null
                          ? `${formatIDR(Number(p.budgetSpent))} / ${formatIDR(Number(p.budgetCap))}`
                          : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={st.variant}>{st.label}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          {!p.archivedAt ? (
                            <>
                              <form action={toggleCoupon}>
                                <input type="hidden" name="id" value={p.id} />
                                <input
                                  type="hidden"
                                  name="next"
                                  value={p.isActive ? "0" : "1"}
                                />
                                <Button type="submit" variant="outline" size="sm">
                                  {p.isActive ? "Deactivate" : "Activate"}
                                </Button>
                              </form>
                              <form action={archiveCoupon}>
                                <input type="hidden" name="id" value={p.id} />
                                <Button type="submit" variant="ghost" size="sm">
                                  Archive
                                </Button>
                              </form>
                            </>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
