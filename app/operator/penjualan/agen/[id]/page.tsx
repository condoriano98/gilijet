import { requireOperator } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatLocalDate } from "@/lib/datetime";
import { formatIDR } from "@/lib/utils";
import { DetailPageTemplate } from "@/components/operator-shell/templates/detail-page-template";
import { DataTable } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";

export async function markAgentPayoutPaid(agentId: string) {
  "use server";
  const session = await requireOperator();
  const operatorId = session.sub;

  const agent = await prisma.travelAgent.findFirst({
    where: { id: agentId, operatorId, deletedAt: null },
    select: { name: true },
  });
  if (!agent) notFound();

  await prisma.operatorNotification.create({
    data: {
      operatorId,
      kind: "AGENT_PAYOUT_DUE",
      severity: "INFO",
      title: "Pembayaran Komisi Agen",
      body: `Komisi untuk ${agent.name} telah ditandai dibayar`,
      readAt: new Date(),
      actionUrl: `/operator/penjualan/agen/${agentId}`,
    },
  });

  revalidatePath(`/operator/penjualan/agen/${agentId}`);
}

function bookingStatusVariant(s: string): "success" | "warning" | "danger" | "neutral" | "info" {
  const map: Record<string, "success" | "warning" | "danger" | "neutral" | "info"> = {
    CONFIRMED: "success",
    PENDING_PAYMENT: "warning",
    EXPIRED: "neutral",
    CANCELLED_BY_CUSTOMER: "danger",
    CANCELLED_BY_OPERATOR: "danger",
  };
  return map[s] ?? "neutral";
}

export default async function TravelAgentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireOperator();
  const operatorId = session.sub;
  const { id } = await params;

  const agent = await prisma.travelAgent.findFirst({
    where: { id, operatorId, deletedAt: null },
  });
  if (!agent) notFound();

  const bookings = await prisma.booking.findMany({
    where: { salesAgentId: id, operatorId },
    include: {
      leg: { include: { schedule: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const ytdCommission = bookings
    .filter((b) => b.status === "CONFIRMED")
    .reduce((sum, b) => sum + Number(b.agentCommissionAmount ?? 0), 0);

  type BookingRow = (typeof bookings)[number];
  const columns = [
    {
      key: "bookingReference",
      header: "Ref.",
      render: (row: BookingRow) => (
        <Link href={`/operator/penjualan/${row.id}`} className="font-mono text-sm text-mekari-primary hover:underline">
          {row.bookingReference}
        </Link>
      ),
    },
    {
      key: "createdAt",
      header: "Tanggal",
      render: (row: BookingRow) => formatLocalDate(row.createdAt, "dd MMM yyyy"),
    },
    {
      key: "route",
      header: "Rute",
      render: (row: BookingRow) =>
        `${row.leg.schedule.originPort} → ${row.leg.schedule.destinationPort}`,
    },
    {
      key: "totalAmount",
      header: "Total",
      align: "right" as const,
      render: (row: BookingRow) => formatIDR(Number(row.totalAmount)),
    },
    {
      key: "agentCommissionAmount",
      header: "Komisi",
      align: "right" as const,
      render: (row: BookingRow) => formatIDR(Number(row.agentCommissionAmount ?? 0)),
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
  ];

  return (
    <DetailPageTemplate
      title={agent.name}
      status={{
        label: agent.isActive ? "Aktif" : "Nonaktif",
        variant: agent.isActive ? "success" : "neutral",
      }}
      actions={
        <>
          <Button asChild variant="outline" size="sm">
            <Link href="/operator/penjualan/agen">Kembali</Link>
          </Button>
          <form action={markAgentPayoutPaid.bind(null, agent.id)}>
            <Button type="submit" size="sm" className="bg-mekari-primary hover:bg-mekari-primary-600">
              Tandai Dibayar
            </Button>
          </form>
        </>
      }
    >
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-1">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-mekari-neutral-500">
            Profil Agen
          </h2>
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-mekari-neutral-500">Nama</dt>
              <dd className="font-medium text-mekari-neutral-900">{agent.name}</dd>
            </div>
            {agent.contactPerson && (
              <div>
                <dt className="text-mekari-neutral-500">Kontak</dt>
                <dd className="text-mekari-neutral-900">{agent.contactPerson}</dd>
              </div>
            )}
            {agent.phoneNumber && (
              <div>
                <dt className="text-mekari-neutral-500">Telepon</dt>
                <dd className="font-mono text-mekari-neutral-900">{agent.phoneNumber}</dd>
              </div>
            )}
            {agent.email && (
              <div>
                <dt className="text-mekari-neutral-500">Email</dt>
                <dd className="text-mekari-neutral-900">{agent.email}</dd>
              </div>
            )}
            {agent.npwp && (
              <div>
                <dt className="text-mekari-neutral-500">NPWP</dt>
                <dd className="font-mono text-mekari-neutral-900">{agent.npwp}</dd>
              </div>
            )}
            <div>
              <dt className="text-mekari-neutral-500">Komisi Default</dt>
              <dd className="text-mekari-neutral-900">
                {(Number(agent.defaultCommissionPercent) * 100).toLocaleString("id-ID", {
                  maximumFractionDigits: 2,
                })}
                %
              </dd>
            </div>
            {(agent.bankName || agent.bankAccountNumber || agent.bankAccountName) && (
              <div className="border-t border-mekari-neutral-200 pt-3">
                <dt className="mb-1 text-mekari-neutral-500">Bank</dt>
                <dd className="space-y-0.5 text-mekari-neutral-900">
                  {agent.bankName && <div>{agent.bankName}</div>}
                  {agent.bankAccountNumber && (
                    <div className="font-mono text-xs">{agent.bankAccountNumber}</div>
                  )}
                  {agent.bankAccountName && <div className="text-xs">{agent.bankAccountName}</div>}
                </dd>
              </div>
            )}
            <div className="border-t border-mekari-neutral-200 pt-3">
              <dt className="text-mekari-neutral-500">Komisi YTD</dt>
              <dd className="text-lg font-semibold text-mekari-neutral-900">{formatIDR(ytdCommission)}</dd>
            </div>
          </dl>
        </Card>

        <div className="lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-mekari-neutral-500">
            Booking Agen
          </h2>
          <DataTable
            columns={columns}
            data={bookings}
            emptyMessage="Belum ada booking untuk agen ini"
          />
        </div>
      </div>
    </DetailPageTemplate>
  );
}