import { requireOperator } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatIDR } from "@/lib/utils";
import { ListPageTemplate } from "@/components/operator-shell/templates/list-page-template";
import { DataTable } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import Link from "next/link";

export default async function TravelAgentListPage() {
  const session = await requireOperator();
  const operatorId = session.sub;

  const startOfYear = new Date(new Date().getFullYear(), 0, 1);

  const agents = await prisma.travelAgent.findMany({
    where: { operatorId, deletedAt: null },
    orderBy: { name: "asc" },
  });

  const agentStats = await Promise.all(
    agents.map(async (agent) => {
      const [count, commission] = await Promise.all([
        prisma.booking.count({
          where: {
            operatorId,
            salesAgentId: agent.id,
            status: "CONFIRMED",
            createdAt: { gte: startOfYear },
          },
        }),
        prisma.booking.aggregate({
          where: {
            operatorId,
            salesAgentId: agent.id,
            status: "CONFIRMED",
            createdAt: { gte: startOfYear },
          },
          _sum: { agentCommissionAmount: true },
        }),
      ]);
      return {
        agentId: agent.id,
        ytdBookings: count,
        ytdCommission: Number(commission._sum.agentCommissionAmount ?? 0),
      };
    }),
  );

  const statsMap = new Map(agentStats.map((s) => [s.agentId, s]));

  const rows = agents.map((agent) => {
    const stat = statsMap.get(agent.id);
    return {
      id: agent.id,
      name: agent.name,
      npwp: agent.npwp,
      defaultCommissionPercent: Number(agent.defaultCommissionPercent),
      ytdBookings: stat?.ytdBookings ?? 0,
      ytdCommission: stat?.ytdCommission ?? 0,
      isActive: agent.isActive,
    };
  });

  type AgentRow = (typeof rows)[number];

  const columns = [
    {
      key: "name",
      header: "Nama",
      render: (row: AgentRow) => (
        <Link href={`/operator/penjualan/agen/${row.id}`} className="font-medium text-mekari-primary hover:underline">
          {row.name}
        </Link>
      ),
    },
    {
      key: "npwp",
      header: "NPWP",
      render: (row: AgentRow) => (row.npwp ? <span className="font-mono text-xs">{row.npwp}</span> : "-"),
    },
    {
      key: "defaultCommissionPercent",
      header: "Komisi Default",
      align: "right" as const,
      render: (row: AgentRow) =>
        `${(row.defaultCommissionPercent * 100).toLocaleString("id-ID", { maximumFractionDigits: 2 })}%`,
    },
    {
      key: "ytdBookings",
      header: "Booking YTD",
      align: "center" as const,
      render: (row: AgentRow) => `${row.ytdBookings}`,
    },
    {
      key: "ytdCommission",
      header: "Komisi YTD",
      align: "right" as const,
      render: (row: AgentRow) => formatIDR(row.ytdCommission),
    },
    {
      key: "isActive",
      header: "Status",
      align: "center" as const,
      render: (row: AgentRow) => (
        <StatusBadge variant={row.isActive ? "success" : "neutral"}>
          {row.isActive ? "Aktif" : "Nonaktif"}
        </StatusBadge>
      ),
    },
  ];

  return (
    <ListPageTemplate
      title="Agen Perjalanan"
      subtitle="Daftar agen perjalanan dan ringkasan komisi tahun berjalan"
      primaryAction={{ label: "+ Tambah Agen", href: "/operator/penjualan/agen/baru" }}
    >
      <DataTable columns={columns} data={rows} emptyMessage="Belum ada agen perjalanan" />
    </ListPageTemplate>
  );
}