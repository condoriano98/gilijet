import { requireOperator } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatLocalDate, formatLocalTime } from "@/lib/datetime";
import { formatIDR } from "@/lib/utils";
import { ListPageTemplate } from "@/components/operator-shell/templates/list-page-template";
import { DataTable } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { KpiCard } from "@/components/ui/kpi-card";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { transitionEFaktur } from "./actions";
import { TrendingUp, FileText } from "lucide-react";

function efakturStatusVariant(
  s: string,
): "success" | "warning" | "danger" | "neutral" | "info" {
  const map: Record<string, "success" | "warning" | "danger" | "neutral" | "info"> = {
    ACCEPTED: "success",
    DRAFT: "warning",
    SUBMITTED: "info",
    REJECTED: "danger",
    NOT_REQUIRED: "neutral",
  };
  return map[s] ?? "neutral";
}

function allowedTransitions(current: string): string[] {
  const map: Record<string, string[]> = {
    NOT_REQUIRED: ["DRAFT"],
    DRAFT: ["SUBMITTED"],
    SUBMITTED: ["ACCEPTED", "REJECTED"],
  };
  return map[current] ?? [];
}

function monthRange(monthsBack: number) {
  const now = new Date();
  const months: { start: Date; end: Date; label: string }[] = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    months.push({ start, end, label: formatLocalDate(start, "MMM yyyy") });
  }
  return months;
}

async function submitTransition(formData: FormData) {
  "use server";
  await transitionEFaktur({
    bookingId: String(formData.get("bookingId")),
    newStatus: String(formData.get("newStatus")) as
      | "DRAFT"
      | "SUBMITTED"
      | "ACCEPTED"
      | "REJECTED",
    note: formData.get("note") ? String(formData.get("note")) : undefined,
  });
}

export default async function AkuntansiPage() {
  const session = await requireOperator();
  const operatorId = session.sub;

  const months = monthRange(3);
  const revenueData = await Promise.all(
    months.map(async (m) => {
      const agg = await prisma.payment.aggregate({
        where: {
          status: "SUCCESSFUL",
          paidAt: { gte: m.start, lt: m.end },
          booking: { operatorId },
        },
        _sum: { amount: true },
        _count: true,
      });
      return {
        label: m.label,
        total: Number(agg._sum.amount ?? 0),
        count: agg._count,
      };
    }),
  );

  const bookings = await prisma.booking.findMany({
    where: { operatorId },
    include: { payment: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  type BookingRow = (typeof bookings)[number];
  const columns = [
    {
      key: "bookingReference",
      header: "Ref. Booking",
      render: (row: BookingRow) => (
        <Link
          href={`/operator/penjualan/${row.id}`}
          className="font-mono text-sm text-mekari-primary hover:underline"
        >
          {row.bookingReference}
        </Link>
      ),
    },
    {
      key: "customerName",
      header: "Pelanggan",
      render: (row: BookingRow) => row.customerName,
    },
    {
      key: "totalAmount",
      header: "Nominal Kotor",
      align: "right" as const,
      render: (row: BookingRow) => formatIDR(Number(row.totalAmount)),
    },
    {
      key: "eFakturStatus",
      header: "Status e-Faktur",
      render: (row: BookingRow) => (
        <StatusBadge variant={efakturStatusVariant(row.eFakturStatus)}>
          {row.eFakturStatus.replace(/_/g, " ")}
        </StatusBadge>
      ),
    },
    {
      key: "eFakturNumber",
      header: "No. e-Faktur",
      render: (row: BookingRow) =>
        row.eFakturNumber ? (
          <span className="font-mono text-xs">{row.eFakturNumber}</span>
        ) : (
          "-"
        ),
    },
    {
      key: "daysSinceCreation",
      header: "Usia (Hari)",
      align: "center" as const,
      render: (row: BookingRow) => {
        const days = Math.floor(
          (Date.now() - new Date(row.createdAt).getTime()) / 86_400_000,
        );
        return (
          <span>
            {days}
            <span className="block text-xs text-mekari-neutral-500">
              {formatLocalDate(row.createdAt, "dd MMM")}{" "}
              {formatLocalTime(row.createdAt)}
            </span>
          </span>
        );
      },
    },
    {
      key: "action",
      header: "Aksi",
      render: (row: BookingRow) => {
        const next = allowedTransitions(row.eFakturStatus);
        if (next.length === 0)
          return <span className="text-xs text-mekari-neutral-400">—</span>;
        return (
          <div className="flex flex-wrap gap-1">
            {next.map((status) => (
              <form key={status} action={submitTransition}>
                <input type="hidden" name="bookingId" value={row.id} />
                <input type="hidden" name="newStatus" value={status} />
                <Button
                  type="submit"
                  size="sm"
                  variant={status === "REJECTED" ? "destructive" : "outline"}
                  className="h-7 px-2 text-xs"
                >
                  → {status}
                </Button>
              </form>
            ))}
          </div>
        );
      },
    },
  ];

  return (
    <ListPageTemplate
      title="Akuntansi"
      subtitle="Pelacakan e-Faktur dan ringkasan pendapatan"
      kpis={
        <>
          {revenueData.map((m) => (
            <KpiCard
              key={m.label}
              label={`Pendapatan ${m.label}`}
              value={formatIDR(m.total)}
              hint={`${m.count} transaksi sukses`}
              icon={<TrendingUp size={20} />}
              accent="green"
            />
          ))}
        </>
      }
    >
      <div>
        <h2 className="mb-3 text-lg font-semibold text-mekari-neutral-900">
          Pelacakan e-Faktur
        </h2>
        <DataTable
          columns={columns}
          data={bookings}
          emptyMessage="Belum ada booking"
        />
      </div>
      <Card>
        <CardContent className="flex items-center gap-3 p-4">
          <FileText size={20} className="text-mekari-neutral-400" />
          <p className="text-sm text-mekari-neutral-500">
            Jurnal akuntansi tersedia pada Phase B+.
          </p>
        </CardContent>
      </Card>
    </ListPageTemplate>
  );
}
