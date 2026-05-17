import { requireOperator } from "@/lib/auth";
import { prisma } from "@/lib/db";
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

export default async function OperatorBoatsPage() {
  const session = await requireOperator();
  const boats = await prisma.boat.findMany({
    where: { operatorId: session.sub },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Boats</h1>
        <p className="text-sm text-muted-foreground">
          The boat creation form ships with Phase 3. Existing boats (seeded or
          created via admin) appear below.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {boats.length.toLocaleString()} boat
            {boats.length === 1 ? "" : "s"}
          </CardTitle>
          <CardDescription>Your active fleet.</CardDescription>
        </CardHeader>
        <CardContent>
          {boats.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No boats yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Registration #</TableHead>
                  <TableHead>Capacity</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {boats.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-medium">{b.name}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {b.registrationNumber}
                    </TableCell>
                    <TableCell>{b.capacity}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{b.status}</Badge>
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
