import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
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

export const metadata = { title: "Promotions · Admin" };

async function toggleActiveAction(formData: FormData) {
  "use server";
  const session = await requireAdmin();
  const id = String(formData.get("id"));
  const next = formData.get("next") === "1";
  if (!id) redirect("/admin/promos");
  await prisma.promotion.update({
    where: { id },
    data: { isActive: next },
  });
  await audit({
    entityType: "PROMOTION",
    entityId: id,
    action: next ? "activated" : "deactivated",
    userId: session.sub,
    userRole: "ADMIN",
  });
  redirect("/admin/promos");
}

export default async function PromosPage() {
  await requireAdmin();

  const promos = await prisma.promotion.findMany({
    orderBy: { createdAt: "desc" },
  });

  const now = Date.now();

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Promotions</h1>
          <p className="text-sm text-muted-foreground">
            Discount codes customers can apply at checkout.
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/promos/new">+ New promo</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All promotions</CardTitle>
          <CardDescription>
            Deactivating a promo stops new redemptions but doesn&apos;t affect
            past bookings.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {promos.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No promotions yet. Create one to enable customer discounts.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Discount</TableHead>
                  <TableHead>Min spend</TableHead>
                  <TableHead>Usage</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {promos.map((p) => {
                  const expired = p.expiresAt && p.expiresAt.getTime() < now;
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono font-semibold">
                        {p.code}
                      </TableCell>
                      <TableCell>
                        {p.discountType === "PERCENT"
                          ? `${Number(p.discountValue)}%`
                          : formatIDR(Number(p.discountValue))}
                      </TableCell>
                      <TableCell>
                        {Number(p.minAmount) > 0
                          ? formatIDR(Number(p.minAmount))
                          : "—"}
                      </TableCell>
                      <TableCell>
                        {p.usedCount}
                        {p.maxUses != null ? ` / ${p.maxUses}` : ""}
                      </TableCell>
                      <TableCell className="text-xs">
                        {p.expiresAt
                          ? p.expiresAt.toLocaleDateString("id-ID")
                          : "Never"}
                      </TableCell>
                      <TableCell>
                        {expired ? (
                          <Badge variant="destructive">Expired</Badge>
                        ) : p.isActive ? (
                          <Badge variant="success">Active</Badge>
                        ) : (
                          <Badge variant="outline">Inactive</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <form action={toggleActiveAction}>
                          <input type="hidden" name="id" value={p.id} />
                          <input
                            type="hidden"
                            name="next"
                            value={p.isActive ? "0" : "1"}
                          />
                          <Button
                            type="submit"
                            variant="outline"
                            size="sm"
                          >
                            {p.isActive ? "Deactivate" : "Activate"}
                          </Button>
                        </form>
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
