import { requireOperator } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatLocalDate, formatLocalTime } from "@/lib/datetime";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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

export default async function SertifikasiAwakPage() {
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
      header: "Jenis Dokumen",
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
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Sertifikasi Awak</CardTitle>
          <CardDescription>
            Modul ini akan tersedia pada Phase B+ — membutuhkan model
            CrewCertification.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Saat ini menampilkan daftar dokumen operator yang ada.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Dokumen Operator</CardTitle>
          <CardDescription>Read-only</CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={documents}
            emptyMessage="Belum ada dokumen operator"
          />
        </CardContent>
      </Card>
    </div>
  );
}