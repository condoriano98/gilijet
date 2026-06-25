import { requireOperator } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatLocalDateTime } from "@/lib/datetime";
import { formatIDR } from "@/lib/utils";
import { ListPageTemplate } from "@/components/operator-shell/templates/list-page-template";
import { DataTable } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";

export default async function RekonsiliasiPage() {
  const session = await requireOperator();
  const operatorId = session.sub;

  // variance <> 0 also excludes NULL rows in Postgres, so this yields only
  // closed sessions whose counted cash did not match the expected cash.
  const sessions = await prisma.cashDrawerSession.findMany({
    where: { operatorId, closedAt: { not: null }, variance: { not: 0 } },
    include: { staff: true },
    orderBy: { closedAt: "desc" },
  });

  type Row = (typeof sessions)[number];

  const columns = [
    {
      key: "id",
      header: "Sesi",
      render: (r: Row) => (
        <span className="font-mono text-xs text-mekari-neutral-500">{r.id.slice(-8)}</span>
      ),
    },
    {
      key: "staff",
      header: "Staf",
      render: (r: Row) => r.staff.fullName,
    },
    {
      key: "openedAt",
      header: "Dibuka",
      render: (r: Row) => formatLocalDateTime(r.openedAt),
    },
    {
      key: "expectedCash",
      header: "Kas Diharapkan",
      align: "right" as const,
      render: (r: Row) => formatIDR(Number(r.expectedCash)),
    },
    {
      key: "closingBalanceCounted",
      header: "Dihitung",
      align: "right" as const,
      render: (r: Row) => formatIDR(Number(r.closingBalanceCounted ?? 0)),
    },
    {
      key: "variance",
      header: "Selisih",
      align: "right" as const,
      render: (r: Row) => {
        const v = Number(r.variance ?? 0);
        const variant = v > 0 ? "warning" : "danger";
        return <StatusBadge variant={variant}>{formatIDR(v)}</StatusBadge>;
      },
    },
    {
      key: "notes",
      header: "Catatan",
      render: (r: Row) => (r.notes ? r.notes : "-"),
    },
  ];

  return (
    <ListPageTemplate
      title="Rekonsiliasi Kas"
      subtitle="Sesi dengan selisih (variance) bukan nol"
      secondaryActions={[{ label: "Kembali", href: "/operator/kas" }]}
    >
      <DataTable
        columns={columns}
        data={sessions}
        emptyMessage="Tidak ada selisih kas. Semua sesi seimbang."
      />
    </ListPageTemplate>
  );
}
