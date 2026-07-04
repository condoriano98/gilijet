import { requireOperator } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatLocalDate } from "@/lib/datetime";
import { formatIDR, cn } from "@/lib/utils";
import { ListPageTemplate } from "@/components/operator-shell/templates/list-page-template";
import { DataTable } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { EFakturStatus } from "@prisma/client";
import { Download } from "lucide-react";

function monthRange(monthsBack: number) {
  const now = new Date();
  const months: { start: Date; end: Date; key: string; label: string }[] = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    const key = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`;
    months.push({ start, end, key, label: formatLocalDate(start, "MMM yyyy") });
  }
  return months;
}

function TabBar({ activeTab }: { activeTab: "ppn" | "pph23" }) {
  const tabs = [
    { key: "ppn" as const, label: "PPN", href: "/operator/pajak?tab=ppn" },
    { key: "pph23" as const, label: "PPh23", href: "/operator/pajak?tab=pph23" },
  ];
  return (
    <div className="flex gap-2 border-b border-mekari-neutral-200">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className={cn(
            "px-4 py-2 text-sm font-medium",
            activeTab === t.key
              ? "border-b-2 border-mekari-primary text-mekari-primary"
              : "text-mekari-neutral-500 hover:text-mekari-neutral-900",
          )}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}

export default async function PajakPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await requireOperator();
  const operatorId = session.sub;
  const sp = await searchParams;
  const activeTab = sp.tab === "pph23" ? "pph23" : "ppn";

  if (activeTab === "ppn") {
    const months = monthRange(6);
    const ppnData = await Promise.all(
      months.map(async (m) => {
        // Gross and DPP both scope to the e-Faktur set (DRAFT/SUBMITTED/
        // ACCEPTED) so the on-screen figures reconcile with the CSV export,
        // which computes VAT from that same population.
        const eFakturSet = {
          in: [
            EFakturStatus.DRAFT,
            EFakturStatus.SUBMITTED,
            EFakturStatus.ACCEPTED,
          ],
        };
        const [grossAgg, dppAgg] = await Promise.all([
          prisma.booking.aggregate({
            where: {
              operatorId,
              status: "CONFIRMED",
              eFakturStatus: eFakturSet,
              createdAt: { gte: m.start, lt: m.end },
            },
            _sum: { totalAmount: true },
          }),
          prisma.booking.aggregate({
            where: {
              operatorId,
              status: "CONFIRMED",
              eFakturStatus: eFakturSet,
              createdAt: { gte: m.start, lt: m.end },
            },
            _sum: { totalAmount: true },
          }),
        ]);
        const gross = Number(grossAgg._sum.totalAmount ?? 0);
        const dpp = Number(dppAgg._sum.totalAmount ?? 0);
        return {
          id: m.key,
          month: m.label,
          gross,
          dpp,
          ppn: dpp * 0.11,
          csvHref: `/api/operator/tax/${m.key}/csv`,
        };
      }),
    );

    type PpnRow = (typeof ppnData)[number];
    const ppnColumns = [
      {
        key: "month",
        header: "Bulan",
        render: (row: PpnRow) => row.month,
      },
      {
        key: "gross",
        header: "Pendapatan Kotor",
        align: "right" as const,
        render: (row: PpnRow) => formatIDR(row.gross),
      },
      {
        key: "dpp",
        header: "DPP (Dasar Pajak)",
        align: "right" as const,
        render: (row: PpnRow) => formatIDR(row.dpp),
      },
      {
        key: "ppn",
        header: "PPN Keluaran (11%)",
        align: "right" as const,
        render: (row: PpnRow) => formatIDR(row.ppn),
      },
      {
        key: "csv",
        header: "Ekspor",
        align: "center" as const,
        render: (row: PpnRow) => (
          <Button
            asChild
            size="sm"
            variant="outline"
            className="h-7 gap-1 px-2 text-xs"
          >
            <Link href={row.csvHref}>
              <Download size={14} /> CSV
            </Link>
          </Button>
        ),
      },
    ];

    return (
      <ListPageTemplate title="Pajak" subtitle="Pelaporan PPN dan PPh23">
        <TabBar activeTab={activeTab} />
        <DataTable
          columns={ppnColumns}
          data={ppnData}
          emptyMessage="Belum ada data"
        />
      </ListPageTemplate>
    );
  }

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const pph23Groups = await prisma.booking.groupBy({
    by: ["salesAgentId"],
    where: {
      operatorId,
      salesAgentId: { not: null },
      createdAt: { gte: monthStart, lt: monthEnd },
    },
    _sum: {
      totalAmount: true,
      pph23WithholdingAmount: true,
    },
  });

  const agentIds = pph23Groups
    .map((g) => g.salesAgentId)
    .filter((id): id is string => id !== null);
  const agents = await prisma.travelAgent.findMany({
    where: { id: { in: agentIds } },
    select: { id: true, name: true },
  });
  const agentMap = new Map(agents.map((a) => [a.id, a.name]));

  const pph23Rows = pph23Groups.map((g) => ({
    id: g.salesAgentId ?? "",
    agentName: agentMap.get(g.salesAgentId ?? "") ?? "Tidak diketahui",
    totalBase: Number(g._sum.totalAmount ?? 0),
    totalWithheld: Number(g._sum.pph23WithholdingAmount ?? 0),
  }));

  type Pph23Row = (typeof pph23Rows)[number];
  const pph23Columns = [
    {
      key: "agentName",
      header: "Agen Perjalanan",
      render: (row: Pph23Row) => row.agentName,
    },
    {
      key: "totalBase",
      header: "Total Dasar",
      align: "right" as const,
      render: (row: Pph23Row) => formatIDR(row.totalBase),
    },
    {
      key: "totalWithheld",
      header: "Total PPh23 Ditahan",
      align: "right" as const,
      render: (row: Pph23Row) => formatIDR(row.totalWithheld),
    },
  ];

  return (
    <ListPageTemplate title="Pajak" subtitle="Pelaporan PPN dan PPh23">
      <TabBar activeTab={activeTab} />
      <DataTable
        columns={pph23Columns}
        data={pph23Rows}
        emptyMessage="Belum ada data PPh23 bulan ini"
      />
    </ListPageTemplate>
  );
}
