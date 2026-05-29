import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { refundViaGateway, isAnyRefundGatewayConfigured } from "@/lib/refund-gateway";
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
import { formatDateTimeID, formatIDR } from "@/lib/utils";
import { refundTierForCustomer } from "@/lib/refunds";
import { sendCancellationEmail, sendRefundProcessedEmail } from "@/lib/email";
import { env } from "@/lib/env";

/**
 * Automatically approves all PENDING refunds where the customer is still in
 * the FULL-refund window (more than 7 days before departure). Safe to call as
 * a background action.
 */
async function autoApproveEligibleRefunds() {
  "use server";
  await requireAdmin();

  const pending = await prisma.refund.findMany({
    where: { status: "PENDING" },
    include: {
      booking: {
        include: {
          payment: true,
          leg: true,
        },
      },
    },
    take: 50,
  });

  let approved = 0;
  for (const refund of pending) {
    const tier = refundTierForCustomer(new Date(), refund.booking.leg.departureDate);
    if (tier !== "FULL") continue;

    let gatewayReference = refund.gatewayReference ?? null;
    let newStatus: "APPROVED" | "PROCESSING" = "APPROVED";

    if (
      isAnyRefundGatewayConfigured() &&
      refund.booking.payment?.status === "SUCCESSFUL" &&
      refund.booking.payment.gatewayReference
    ) {
      try {
        const r = await refundViaGateway({
          gatewayProvider: refund.booking.payment.gatewayProvider,
          gatewayReference: refund.booking.payment.gatewayReference,
          amount: Math.round(Number(refund.refundAmount)),
          reason: "customer_request",
        });
        if (r) {
          gatewayReference = r.id;
          newStatus = "PROCESSING";
        }
      } catch (err) {
        console.error("[auto-approve] gateway refund failed:", err);
        continue;
      }
    }

    await prisma.refund.update({
      where: { id: refund.id },
      data: {
        status: newStatus,
        gatewayReference,
        approvedBy: "system-auto",
        approvedAt: new Date(),
      },
    });

    sendRefundProcessedEmail({
      to: refund.booking.customerEmail,
      customerName: refund.booking.customerName,
      bookingReference: refund.booking.bookingReference,
      refundAmount: Number(refund.refundAmount),
      lookupUrl: `${env.APP_BASE_URL}/b/${refund.booking.bookingReference}`,
    }).catch(() => {});

    approved++;
  }

  redirect(`/admin/refunds?ok=auto_approved_${approved}`);
}

async function approveRefundAction(formData: FormData) {
  "use server";
  const session = await requireAdmin();
  const refundId = String(formData.get("refundId") ?? "");
  if (!refundId) redirect("/admin/refunds");

  const refund = await prisma.refund.findUnique({
    where: { id: refundId },
    include: { booking: { include: { payment: true } } },
  });
  if (!refund) redirect("/admin/refunds?error=missing");
  if (refund.status !== "PENDING") {
    redirect(`/admin/refunds?error=already_${refund.status.toLowerCase()}`);
  }

  // Try to process via the original gateway if the invoice was actually paid through it.
  let gatewayReference: string | null = refund.gatewayReference ?? null;
  let newStatus: "APPROVED" | "PROCESSING" | "COMPLETED" = "APPROVED";

  if (
    isAnyRefundGatewayConfigured() &&
    refund.booking.payment?.status === "SUCCESSFUL" &&
    refund.booking.payment.gatewayReference &&
    !gatewayReference
  ) {
    try {
      const r = await refundViaGateway({
        gatewayProvider: refund.booking.payment.gatewayProvider,
        gatewayReference: refund.booking.payment.gatewayReference,
        amount: Math.round(Number(refund.refundAmount)),
        reason: refund.reason || "admin_approved",
      });
      if (r) {
        gatewayReference = r.id;
        newStatus = "PROCESSING";
      }
    } catch (err) {
      console.error("[admin-refunds] gateway refund failed:", err);
      redirect(`/admin/refunds?error=gateway_failed`);
    }
  }

  await prisma.refund.update({
    where: { id: refund.id },
    data: {
      status: newStatus,
      gatewayReference,
      approvedBy: session.sub,
      approvedAt: new Date(),
      processedAt: newStatus !== "APPROVED" ? new Date() : null,
    },
  });

  await audit({
    entityType: "refund",
    entityId: refund.id,
    action: "approved",
    userRole: "admin",
    userId: session.sub,
    newState: { status: newStatus, gatewayReference },
  });

  redirect(`/admin/refunds?ok=approved`);
}

async function rejectRefundAction(formData: FormData) {
  "use server";
  const session = await requireAdmin();
  const refundId = String(formData.get("refundId") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  if (!refundId) redirect("/admin/refunds");

  const refund = await prisma.refund.findUnique({ where: { id: refundId } });
  if (!refund) redirect("/admin/refunds?error=missing");
  if (refund.status !== "PENDING") {
    redirect(`/admin/refunds?error=already_${refund.status.toLowerCase()}`);
  }

  await prisma.refund.update({
    where: { id: refund.id },
    data: {
      status: "REJECTED",
      approvedBy: session.sub,
      approvedAt: new Date(),
      adminNote: note || null,
    },
  });

  await audit({
    entityType: "refund",
    entityId: refund.id,
    action: "rejected",
    userRole: "admin",
    userId: session.sub,
    newState: { status: "REJECTED", note },
  });

  redirect(`/admin/refunds?ok=rejected`);
}

function statusVariant(status: string) {
  switch (status) {
    case "COMPLETED":
      return "success" as const;
    case "PROCESSING":
    case "APPROVED":
      return "default" as const;
    case "PENDING":
      return "warning" as const;
    case "REJECTED":
    case "FAILED":
      return "destructive" as const;
    default:
      return "outline" as const;
  }
}

export default async function AdminRefundsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string; filter?: string }>;
}) {
  await requireAdmin();
  const { ok, error, filter } = await searchParams;

  const pendingCount = await prisma.refund.count({
    where: { status: "PENDING" },
  });
  const totalPaid = await prisma.refund.aggregate({
    where: { status: { in: ["COMPLETED", "PROCESSING"] } },
    _sum: { refundAmount: true },
  });

  const where =
    filter === "pending"
      ? { status: "PENDING" as const }
      : filter === "completed"
        ? { status: "COMPLETED" as const }
        : {};

  const refunds = await prisma.refund.findMany({
    where,
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 100,
    include: {
      booking: {
        include: {
          payment: true,
          leg: { include: { schedule: true } },
        },
      },
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Refunds</h1>
        <p className="text-sm text-muted-foreground">
          Review pending refund requests and approve or reject them.
        </p>
      </div>

      {ok ? (
        <div className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
          Refund {ok}.
        </div>
      ) : null}
      {error ? (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          Error: {error.replace(/_/g, " ")}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Pending approval</CardDescription>
            <CardTitle className="text-3xl">{pendingCount}</CardTitle>
            {pendingCount > 0 ? (
              <form action={autoApproveEligibleRefunds} className="mt-2">
                <Button type="submit" size="sm" variant="outline">
                  Auto-approve eligible
                </Button>
              </form>
            ) : null}
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total refunded</CardDescription>
            <CardTitle className="text-3xl">
              {formatIDR(Number(totalPaid._sum.refundAmount ?? 0))}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Filter</CardDescription>
            <CardContent className="px-0 pt-2 pb-0">
              <div className="flex gap-2">
                <Button asChild size="sm" variant={!filter ? "default" : "outline"}>
                  <Link href="/admin/refunds">All</Link>
                </Button>
                <Button asChild size="sm" variant={filter === "pending" ? "default" : "outline"}>
                  <Link href="/admin/refunds?filter=pending">Pending</Link>
                </Button>
                <Button asChild size="sm" variant={filter === "completed" ? "default" : "outline"}>
                  <Link href="/admin/refunds?filter=completed">Done</Link>
                </Button>
              </div>
            </CardContent>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Refund requests</CardTitle>
          <CardDescription>
            {refunds.length === 0 ? "No refunds match." : `${refunds.length} shown`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {refunds.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              Nothing here.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Booking</TableHead>
                  <TableHead>Route</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {refunds.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">
                      {r.booking.bookingReference}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {r.booking.leg.schedule.originPort} →{" "}
                      {r.booking.leg.schedule.destinationPort}
                    </TableCell>
                    <TableCell className="text-sm">{r.reason}</TableCell>
                    <TableCell className="font-medium">
                      {formatIDR(Number(r.refundAmount))}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(r.status)}>{r.status}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDateTimeID(r.createdAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      {r.status === "PENDING" ? (
                        <div className="flex justify-end gap-2">
                          <form action={approveRefundAction}>
                            <input type="hidden" name="refundId" value={r.id} />
                            <Button type="submit" size="sm">
                              Approve
                            </Button>
                          </form>
                          <form action={rejectRefundAction}>
                            <input type="hidden" name="refundId" value={r.id} />
                            <Button type="submit" size="sm" variant="outline">
                              Reject
                            </Button>
                          </form>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
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
