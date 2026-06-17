import Link from "next/link";
import { OperatorStatus, Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTimeID } from "@/lib/utils";

const STATUS_FILTERS: OperatorStatus[] = [
  "PENDING",
  "ACTIVE",
  "SUSPENDED",
  "REJECTED",
];

function statusVariant(s: OperatorStatus) {
  switch (s) {
    case "ACTIVE":
      return "success" as const;
    case "PENDING":
      return "warning" as const;
    case "SUSPENDED":
    case "REJECTED":
      return "destructive" as const;
  }
}

export default async function OperatorsListPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireAdmin();
  const { status } = await searchParams;

  const where: Prisma.OperatorWhereInput = { deletedAt: null };
  if (status && STATUS_FILTERS.includes(status as OperatorStatus)) {
    where.status = status as OperatorStatus;
  }

  const operators = await prisma.operator.findMany({
    where,
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: { _count: { select: { boats: { where: { deletedAt: null } } } } },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Operators</h1>
          <p className="text-sm text-muted-foreground">
            Approve, suspend, and inspect boat operators.
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/operators/new">Onboard operator</Link>
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href="/admin/operators">
          <Badge variant={!status ? "default" : "outline"}>All</Badge>
        </Link>
        {STATUS_FILTERS.map((s) => (
          <Link key={s} href={`/admin/operators?status=${s}`}>
            <Badge variant={status === s ? "default" : "outline"}>{s}</Badge>
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {operators.length.toLocaleString()} operator
            {operators.length === 1 ? "" : "s"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {operators.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No operators match this filter.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Company</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Boats</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {operators.map((op) => (
                  <TableRow key={op.id}>
                    <TableCell className="font-medium">
                      {op.companyName}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">{op.contactPerson}</div>
                      <div className="text-xs text-muted-foreground">
                        {op.email}
                      </div>
                    </TableCell>
                    <TableCell>{op._count.boats}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(op.status)}>
                        {op.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDateTimeID(op.createdAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/admin/operators/${op.id}`}>Manage</Link>
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
