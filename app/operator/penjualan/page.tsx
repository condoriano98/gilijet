import { requireOperator } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatLocalDate, formatLocalTime } from "@/lib/datetime";
import { formatIDR } from "@/lib/utils";
import { ListPageTemplate } from "@/components/operator-shell/templates/list-page-template";
import { DataTable } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { KpiCard } from "@/components/ui/kpi-card";
import { agentCommissionYtd, erpFeeYtd } from "@/lib/operator-erp-queries";
import Link from "next/link";
import { ShoppingCart } from "lucide-react";

function channelLabel(ch: string): string {
  const map: Record<string, string> = {
    GILIJET: "Gilibali", WALK_IN: "Walk-in", TRAVEL_AGENT: "Agen",
    PHONE: "Telepon", EXTERNAL_AGGREGATOR: "Aggregator",
  };
  return map[ch] ?? ch;
}

function channelVariant(ch: string): "success" | "warning" | "danger" | "neutral" | "info" {
  const map: Record<string, "success" | "warning" | "danger" | "neutral" | "info"> = {
    GILIJET: "info", WALK_IN: "success", TRAVEL_AGENT: "warning",
    PHONE: "neutral", EXTERNAL_AGGREGATOR: "neutral",
  };
  return map[ch] ?? "neutral";
}

function bookingStatusVariant(s: string): "success" | "warning" | "danger" | "neutral" | "info" {
  const map: Record<string, "success" | "warning" | "danger" | "neutral" | "info"> = {
    CONFIRMED: "success", PENDING_PAYMENT: "warning", EXPIRED: "neutral",
    CANCELLED_BY_CUSTOMER: "danger", CANCELLED_BY_OPERATOR: "danger",
  };
  return map[s] ?? "neutral";
}

export default async function PenjualanPage({
  searchParams,
}: {
  searchParams: Promise<{ channel?: string; status?: string; page?: string }>;
}) {
  const session = await requireOperator();
  const operatorId = session.sub;
  const sp = await searchParams;

  const monthStart = new Date(new Date().toISOString().slice(0, 7) + "-01T00:00:00+08:00");

  const [bookings, monthStats, agentCommission, erpFee] = await Promise.all([
    prisma.booking.findMany({
      where: {
        operatorId,
        ...(sp.channel ? { salesChannel: sp.channel as never } : {}),
        ...(sp.status ? { status: sp.status as never } : {}),
      },
      include: {
        leg: { include: { schedule: { include: { boat: true } } } },
        salesAgent: true,
        tickets: true,
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.booking.aggregate({
      where: { operatorId, status: "CONFIRMED", createdAt: { gte: monthStart } },
      _count: true,
      _sum: { totalAmount: true, operatorAmount: true },
    }),
    agentCommissionYtd(operatorId),
    erpFeeYtd(operatorId),
  ]);

  const monthTickets = monthStats._count;
  const monthGross = Number(monthStats._sum.totalAmount ?? 0);

  type BookingRow = (typeof bookings)[number];
  const columns = [
    {
      key: "bookingReference",
      header: "Ref. Pemesanan",
      render: (row: BookingRow) => (
        <Link href={`/operator/penjualan/${row.id}`} className="font-mono text-sm text-mekari-primary hover:underline">
          {row.bookingReference}
        </Link>
      ),
    },
    {
      key: "createdAt",
      header: "Tgl Booking",
      render: (row: BookingRow) => formatLocalDate(row.createdAt, "dd MMM yyyy"),
    },
    {
      key: "departure",
      header: "Keberangkatan",
      render: (row: BookingRow) => (
        <span>
          {formatLocalDate(row.leg.departureDate, "dd MMM")}{" "}
          <span className="font-mono text-xs">{formatLocalTime(row.leg.departureDate)}</span>
        </span>
      ),
    },
    {
      key: "route",
      header: "Rute",
      render: (row: BookingRow) => `${row.leg.schedule.originPort} → ${row.leg.schedule.destinationPort}`,
    },
    {
      key: "passengers",
      header: "Penumpang",
      align: "center" as const,
      render: (row: BookingRow) => `${row.tickets.length} pax`,
    },
    {
      key: "salesChannel",
      header: "Saluran",
      render: (row: BookingRow) => (
        <StatusBadge variant={channelVariant(row.salesChannel)}>
          {channelLabel(row.salesChannel)}
        </StatusBadge>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (row: BookingRow) => (
        <StatusBadge variant={bookingStatusVariant(row.status)}>
          {row.status.replace(/_/g, " ")}
        </StatusBadge>
      ),
    },
    {
      key: "totalAmount",
      header: "Total",
      align: "right" as const,
      render: (row: BookingRow) => formatIDR(Number(row.totalAmount)),
    },
  ];

  return (
    <ListPageTemplate
      title="Penjualan"
      subtitle="Semua booking dari seluruh saluran penjualan"
      primaryAction={{ label: "+ Tambah Booking", href: "/operator/penjualan/baru" }}
      secondaryActions={[
        { label: "Agen Perjalanan", href: "/operator/penjualan/agen" },
        { label: "Ekspor", onClick: () => {} },
      ]}
      kpis={
        <>
          <KpiCard label="Total Tiket Bulan Ini" value={String(monthTickets)} icon={<ShoppingCart size={20} />} accent="blue" />
          <KpiCard label="Pendapatan Kotor Bulan Ini" value={formatIDR(monthGross)} accent="green" />
          <KpiCard label="Komisi Agen" value={formatIDR(agentCommission)} hint="Tahun berjalan" accent="orange" />
          <KpiCard label="ERP Fee Proyeksi" value={formatIDR(erpFee)} hint="Tahun berjalan" accent="red" />
        </>
      }
    >
      <DataTable columns={columns} data={bookings} emptyMessage="Belum ada booking" />
    </ListPageTemplate>
  );
}
