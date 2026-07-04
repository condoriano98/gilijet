import { requireOperator } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatIDR } from "@/lib/utils";
import { formatLocalDate } from "@/lib/datetime";
import { ListPageTemplate } from "@/components/operator-shell/templates/list-page-template";
import { DataTable } from "@/components/ui/data-table";
import { KpiCard } from "@/components/ui/kpi-card";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Wallet, Users, BadgePercent } from "lucide-react";
import { lockPeriod } from "./actions";

type StaffRow = {
  id: string;
  fullName: string;
  email: string;
  role: string;
  bookingCount: number;
  grossRevenue: number;
  commission: number;
};

export default async function PenggajianPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string }>;
}) {
  const session = await requireOperator();
  const operatorId = session.sub;
  const { ok } = await searchParams;

  // Aggregate in the DB (no in-memory row cap) and read the stored commission
  // amount directly rather than re-deriving percent × total inline.
  const groups = await prisma.booking.groupBy({
    by: ["salesStaffId"],
    where: { operatorId, status: "CONFIRMED", salesStaffId: { not: null } },
    _count: true,
    _sum: { totalAmount: true, agentCommissionAmount: true },
  });

  const staffIds = groups
    .map((g) => g.salesStaffId)
    .filter((id): id is string => id !== null);
  const staff = staffIds.length
    ? await prisma.operatorStaff.findMany({
        where: { id: { in: staffIds }, operatorId },
        select: { id: true, fullName: true, email: true, role: true },
      })
    : [];
  const staffMap = new Map(staff.map((s) => [s.id, s]));

  const rows: StaffRow[] = groups
    .map((g) => {
      const sid = g.salesStaffId as string;
      const s = staffMap.get(sid);
      return {
        id: sid,
        fullName: s?.fullName ?? "Staf tidak dikenal",
        email: s?.email ?? "-",
        role: s?.role ?? "-",
        bookingCount: g._count,
        grossRevenue: Number(g._sum.totalAmount ?? 0),
        commission: Number(g._sum.agentCommissionAmount ?? 0),
      };
    })
    .sort((a, b) => b.commission - a.commission);

  const totalCommission = rows.reduce((s, r) => s + r.commission, 0);
  const totalGross = rows.reduce((s, r) => s + r.grossRevenue, 0);

  const columns = [
    { key: "fullName", header: "Staf", render: (r: StaffRow) => r.fullName },
    { key: "email", header: "Email", render: (r: StaffRow) => r.email },
    { key: "role", header: "Peran", render: (r: StaffRow) => r.role },
    {
      key: "bookingCount",
      header: "Booking",
      align: "right" as const,
      render: (r: StaffRow) => String(r.bookingCount),
    },
    {
      key: "grossRevenue",
      header: "Pendapatan Kotor",
      align: "right" as const,
      render: (r: StaffRow) => formatIDR(r.grossRevenue),
    },
    {
      key: "commission",
      header: "Komisi",
      align: "right" as const,
      render: (r: StaffRow) => formatIDR(r.commission),
    },
  ];

  return (
    <ListPageTemplate
      title="Penggajian"
      subtitle="Ringkasan komisi staf dari penjualan terkonfirmasi"
      kpis={
        <>
          <KpiCard
            label="Total Komisi"
            value={formatIDR(totalCommission)}
            icon={<BadgePercent size={20} />}
            accent="green"
          />
          <KpiCard
            label="Pendapatan Kotor"
            value={formatIDR(totalGross)}
            icon={<Wallet size={20} />}
            accent="blue"
          />
          <KpiCard
            label="Staf dengan Penjualan"
            value={String(rows.length)}
            icon={<Users size={20} />}
            accent="orange"
          />
        </>
      }
    >
      {ok === "locked" && (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Periode payroll telah dikunci. Notifikasi dikirim ke operator.
        </p>
      )}
      <DataTable
        columns={columns}
        data={rows}
        emptyMessage="Belum ada penjualan staf terkonfirmasi"
      />
      <Card>
        <CardHeader>
          <CardTitle>Kunci Periode Payroll</CardTitle>
          <CardDescription>
            Kunci periode untuk memberi sinyal tim akuntansi bahwa draf payroll siap diproses.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={lockPeriod}>
            <Button
              type="submit"
              className="bg-mekari-primary hover:bg-mekari-primary-600"
            >
              Kunci Periode
            </Button>
          </form>
        </CardContent>
        <CardFooter className="text-xs text-mekari-neutral-500">
          Periode payroll terkunci memerlukan model PayrollPeriod (Phase B+).
        </CardFooter>
      </Card>
    </ListPageTemplate>
  );
}
