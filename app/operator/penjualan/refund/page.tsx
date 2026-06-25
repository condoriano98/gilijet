import { requireOperator } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatLocalDate, formatLocalTime } from "@/lib/datetime";
import { formatIDR } from "@/lib/utils";
import { ListPageTemplate } from "@/components/operator-shell/templates/list-page-template";
import { DataTable } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import Link from "next/link";

function refundStatusVariant(s: string): "success" | "warning" | "danger" | "neutral" | "info" {
  const map: Record<string, "success" | "warning" | "danger" | "neutral" | "info"> = {
    COMPLETED: "success",
    APPROVED: "info",
    PROCESSING: "info",
    PENDING: "warning",
    REJECTED: "danger",
    FAILED: "danger",
  };
  return map[s] ?? "neutral";
}

export default async function RefundListPage() {
  const session = await requireOperator();
  const operatorId = session.sub;

  const refunds = await prisma.refund.findMany({
    where: { booking: { operatorId } },
    include: { booking: true },
    orderBy: { createdAt: "desc" },
  });

  type RefundRow = (typeof refunds)[number];
  const columns = [
    {
      key: "bookingReference",
      header: "Ref. Booking",
      render: (row: RefundRow) => (
        <Link href={`/operator/penjualan/${row.booking.id}`} className="font-mono text-sm text-mekari-primary hover:underline">
          {row.booking.bookingReference}
        </Link>
      ),
    },
    {
      key: "customerName",
      header: "Nama Pelanggan",
      render: (row: RefundRow) => row.booking.customerName,
    },
    {
      key: "refundAmount",
      header: "Nominal Refund",
      align: "right" as const,
      render: (row: RefundRow) => formatIDR(Number(row.refundAmount)),
    },
    {
      key: "reason",
      header: "Alasan",
      render: (row: RefundRow) => row.reason.replace(/_/g, " "),
    },
    {
      key: "status",
      header: "Status",
      render: (row: RefundRow) => (
        <StatusBadge variant={refundStatusVariant(row.status)}>{row.status}</StatusBadge>
      ),
    },
    {
      key: "createdAt",
      header: "Dibuat",
      render: (row: RefundRow) => (
        <span>
          {formatLocalDate(row.createdAt, "dd MMM yyyy")}{" "}
          <span className="font-mono text-xs">{formatLocalTime(row.createdAt)}</span>
        </span>
      ),
    },
    {
      key: "processedAt",
      header: "Diproses",
      render: (row: RefundRow) =>
        row.processedAt ? (
          <span>
            {formatLocalDate(row.processedAt, "dd MMM yyyy")}{" "}
            <span className="font-mono text-xs">{formatLocalTime(row.processedAt)}</span>
          </span>
        ) : (
          "-"
        ),
    },
  ];

  return (
    <ListPageTemplate
      title="Refund"
      subtitle="Daftar pengembalian dana untuk booking operator"
    >
      <DataTable columns={columns} data={refunds} emptyMessage="Belum ada refund" />
    </ListPageTemplate>
  );
}