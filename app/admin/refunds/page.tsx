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

export default async function AdminRefundsPage() {
  await requireAdmin();

  const refunds = await prisma.refund.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { booking: true },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Refunds</h1>
        <p className="text-sm text-muted-foreground">
          Manual approval workflow ships in Phase 4.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent refund requests</CardTitle>
          <CardDescription>
            {refunds.length === 0
              ? "No refunds yet."
              : `${refunds.length} most recent`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {refunds.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              Refund requests will appear here once Phase 2 (bookings) is live.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Booking</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {refunds.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">
                      {r.booking.bookingReference}
                    </TableCell>
                    <TableCell className="text-sm">{r.reason}</TableCell>
                    <TableCell>{formatIDR(Number(r.refundAmount))}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{r.status}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDateTimeID(r.createdAt)}
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
