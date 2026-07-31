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

export const metadata = { title: "Boats · Operations" };

export default async function OperationsBoatsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  await requireSuperAdmin();
  const { ok, error } = await searchParams;

  const boats = await prisma.boat.findMany({
    where: { deletedAt: null },
    orderBy: [{ operator: { companyName: "asc" } }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      registrationNumber: true,
      capacity: true,
      status: true,
      operator: { select: { companyName: true } },
      _count: { select: { schedules: true } },
    },
  });

  return (
    <div className="space-y-6">
      {ok ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
          Saved.
        </div>
      ) : null}
      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle>Boats ({boats.length})</CardTitle>
            <CardDescription>
              A schedule needs a boat, so add the vessel before the route.
            </CardDescription>
          </div>
          <Button asChild>
            <Link href="/admin/operations/boats/new">Add boat</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {boats.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No boats yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Boat</TableHead>
                  <TableHead>Operator</TableHead>
                  <TableHead>Registration</TableHead>
                  <TableHead className="text-right">Capacity</TableHead>
                  <TableHead className="text-right">Schedules</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {boats.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/admin/operations/boats/${b.id}`}
                        className="hover:underline"
                      >
                        {b.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm">
                      {b.operator.companyName}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {b.registrationNumber}
                    </TableCell>
                    <TableCell className="text-right">{b.capacity}</TableCell>
                    <TableCell className="text-right">
                      {b._count.schedules}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={b.status === "ACTIVE" ? "success" : "outline"}
                      >
                        {b.status}
                      </Badge>
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
