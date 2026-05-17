import { requireAdmin } from "@/lib/auth";
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
import { formatDateTimeID, formatIDR } from "@/lib/utils";

export default async function AdminBookingsPage() {
  await requireAdmin();

  const bookings = await prisma.booking.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      leg: { include: { schedule: { include: { boat: true } } } },
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Bookings</h1>
        <p className="text-sm text-muted-foreground">
          Most recent 50. Filters and CSV export ship in Phase 2.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent bookings</CardTitle>
          <CardDescription>
            {bookings.length === 0
              ? "No bookings yet — Phase 2 turns the customer flow on."
              : `${bookings.length} most recent`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {bookings.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              Once the booking engine is live, confirmed and pending bookings
              will appear here.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reference</TableHead>
                  <TableHead>Route</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bookings.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-mono text-xs">
                      {b.bookingReference}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {b.leg.schedule.originPort} →{" "}
                        {b.leg.schedule.destinationPort}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {b.leg.schedule.boat.name} ·{" "}
                        {formatDateTimeID(b.leg.departureDate)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">{b.customerName}</div>
                      <div className="text-xs text-muted-foreground">
                        {b.customerEmail}
                      </div>
                    </TableCell>
                    <TableCell>{formatIDR(Number(b.totalAmount))}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{b.status}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDateTimeID(b.createdAt)}
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
