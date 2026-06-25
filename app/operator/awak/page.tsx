import Link from "next/link";
import { requireOperator } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatLocalDate, formatLocalTime } from "@/lib/datetime";
import { ListPageTemplate } from "@/components/operator-shell/templates/list-page-template";
import { DataTable } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";

const crewRoleVariant: Record<string, "success" | "warning" | "danger" | "neutral" | "info"> = {
  CAPTAIN: "info",
  CREW: "neutral",
  ENGINEER: "warning",
};

const staffStatusVariant: Record<string, "success" | "warning" | "danger" | "neutral" | "info"> = {
  ACTIVE: "success",
  SUSPENDED: "danger",
};

export default async function AwakListPage() {
  const session = await requireOperator();
  const operatorId = session.sub;

  const staff = await prisma.operatorStaff.findMany({
    where: {
      operatorId,
      deletedAt: null,
      role: { in: ["CAPTAIN", "CREW", "ENGINEER"] },
    },
    orderBy: { createdAt: "desc" },
  });

  type StaffRow = (typeof staff)[number];
  const columns = [
    {
      key: "fullName",
      header: "Nama",
      render: (row: StaffRow) => (
        <Link
          href={`/operator/awak/${row.id}`}
          className="font-medium text-mekari-primary hover:underline"
        >
          {row.fullName}
        </Link>
      ),
    },
    {
      key: "email",
      header: "Email",
      render: (row: StaffRow) => (
        <span className="font-mono text-xs">{row.email}</span>
      ),
    },
    {
      key: "role",
      header: "Peran",
      render: (row: StaffRow) => (
        <StatusBadge variant={crewRoleVariant[row.role] ?? "neutral"}>
          {row.role}
        </StatusBadge>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (row: StaffRow) => (
        <StatusBadge variant={staffStatusVariant[row.status] ?? "neutral"}>
          {row.status === "ACTIVE" ? "Aktif" : "Ditangguhkan"}
        </StatusBadge>
      ),
    },
    {
      key: "createdAt",
      header: "Dibuat",
      render: (row: StaffRow) => (
        <span>
          {formatLocalDate(row.createdAt, "dd MMM yyyy")}{" "}
          <span className="font-mono text-xs">{formatLocalTime(row.createdAt)}</span>
        </span>
      ),
    },
  ];

  return (
    <ListPageTemplate
      title="Awak Kapal"
      subtitle="Daftar kapten, kru, dan teknisi yang terdaftar untuk operator ini"
    >
      <DataTable
        columns={columns}
        data={staff}
        getRowHref={(row) => `/operator/awak/${row.id}`}
        emptyMessage="Belum ada awak kapal"
      />
    </ListPageTemplate>
  );
}