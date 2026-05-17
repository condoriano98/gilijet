import Link from "next/link";
import { requireOperator } from "@/lib/auth";
import { getOperatorBoats } from "@/lib/operator-data";
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

export default async function OperatorBoatsPage() {
  const session = await requireOperator();
  const boats = await getOperatorBoats(session.sub);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Boats</h1>
          <p className="text-sm text-muted-foreground">
            Your fleet. Capacity here drives every departure&apos;s seat count.
          </p>
        </div>
        <Button asChild>
          <Link href="/operator/boats/new">New boat</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {boats.length.toLocaleString()} boat{boats.length === 1 ? "" : "s"}
          </CardTitle>
          <CardDescription>Active boats accept new departures.</CardDescription>
        </CardHeader>
        <CardContent>
          {boats.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No boats yet — create your first one.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Registration #</TableHead>
                  <TableHead>Capacity</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
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
                    <TableCell className="text-right">
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/operator/boats/${b.id}`}>Edit</Link>
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
