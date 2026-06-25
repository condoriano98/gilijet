import Link from "next/link";
import { requireOperator } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatLocalDate, formatLocalTime } from "@/lib/datetime";
import { ListPageTemplate } from "@/components/operator-shell/templates/list-page-template";
import { DataTable } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";

const documentStatusVariant: Record<
  string,
  "success" | "warning" | "danger" | "neutral" | "info"
> = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "danger",
  EXPIRED: "neutral",
};

export default async function SertifikatKapalPage() {
  const session = await requireOperator();
  const operatorId = session.sub;

  const documents = await prisma.operatorDocument.findMany({
    where: { operatorId },
    orderBy: { createdAt: "desc" },
  });

  type DocRow = (typeof documents)[number];
  const columns = [
    {
      key: "type",
      header: "Jenis",
      render: (row: DocRow) => row.type.replace(/_/g, " "),
    },
    {
      key: "status",
      header: "Status",
      render: (row: DocRow) => (
        <StatusBadge variant={documentStatusVariant[row.status] ?? "neutral"}>
          {row.status}
        </StatusBadge>
      ),
    },
    {
      key: "fileUrl",
      header: "File",
      render: (row: DocRow) =>
        row.fileUrl ? (
          <Link
            href={row.fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-xs text-mekari-primary hover:underline"
          >
            Lihat file
          </Link>
        ) : (
          "-"
        ),
    },
    {
      key: "createdAt",
      header: "Dibuat",
      render: (row: DocRow) => (
        <span>
          {formatLocalDate(row.createdAt, "dd MMM yyyy")}{" "}
          <span className="font-mono text-xs">{formatLocalTime(row.createdAt)}</span>
        </span>
      ),
    },
  ];

  return (
    <ListPageTemplate
      title="Sertifikat Kapal"
      subtitle="Daftar dokumen dan sertifikat operator (read-only)"
    >
      <DataTable
        columns={columns}
        data={documents}
        emptyMessage="Belum ada sertifikat kapal"
      />
    </ListPageTemplate>
  );
}