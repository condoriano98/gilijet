import { requireOperator } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";

export default async function JadwalAwakPage() {
  const session = await requireOperator();
  const operatorId = session.sub;

  const crew = await prisma.operatorStaff.findMany({
    where: {
      operatorId,
      deletedAt: null,
      role: { in: ["CAPTAIN", "CREW", "ENGINEER"] },
    },
    include: {
      _count: { select: { checkIns: true } },
    },
    orderBy: { fullName: "asc" },
  });

  type CrewRow = (typeof crew)[number];
  const columns = [
    {
      key: "fullName",
      header: "Nama",
      render: (row: CrewRow) => row.fullName,
    },
    {
      key: "role",
      header: "Peran",
      render: (row: CrewRow) => row.role,
    },
    {
      key: "checkInCount",
      header: "Jumlah Check-in",
      align: "right" as const,
      render: (row: CrewRow) => row._count.checkIns.toLocaleString("id-ID"),
    },
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Jadwal Awak</CardTitle>
          <CardDescription>
            Modul ini akan tersedia pada Phase B+ — membutuhkan model
            LegCrewAssignment.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Saat ini hanya menampilkan ringkasan jumlah check-in per anggota
            awak.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ringkasan Check-in</CardTitle>
          <CardDescription>Read-only</CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={crew}
            emptyMessage="Belum ada awak yang terdaftar"
          />
        </CardContent>
      </Card>
    </div>
  );
}