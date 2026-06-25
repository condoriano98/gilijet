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

  const bookings = await prisma.booking.findMany({
    where: { operatorId, status: "CONFIRMED", salesStaffId: { not: null } },
    select: {
      salesStaffId: true,
      agentCommissionAmount: true,
      agentCommissionPercent: true,
      totalAmount: true,
    },
    take: 5000,
  });

  const agg = new Map<
    string,
    { bookingCount: number; grossRevenue: number; commission: number }
  >();
  for (const b of bookings) {
    const sid = b.salesStaffId as string;
    const cur = agg.get(sid) ?? { bookingCount: 0, grossRevenue: 0, commission: 0 };
    cur.bookingCount += 1;
    const total = Number(b.totalAmount);
    cur.grossRevenue += total;
    cur.commission +=
      b.agentCommissionAmount != null
        ? Number(b.agentCommissionAmount)
        : b.agentCommissionPercent != null
          ? Number(b.agentCommissionPercent) * total
          : 0;
    agg.set(sid, cur);
  }

  const staffIds = [...agg.keys()];
  const staff = staffIds.length
    ? await prisma.operatorStaff.findMany({
        where: { id: { in: staffIds } },
        select: { id: true, fullName: true, email: true, role: true },
      })
    : [];
  const staffMap = new Map(staff.map((s) => [s.id, s]));

  const rows: StaffRow[] = [...agg.entries()]
    .map(([salesStaffId, v]) => {
      const s = staffMap.get(salesStaffId);
      return {
        id: salesStaffId,
        fullName: s?.fullName ?? "Staf tidak dikenal",
        email: s?.email ?? "-",
        role: s?.role ?? "-",
        bookingCount: v.bookingCount,
        grossRevenue: v.grossRevenue,
        commission: v.commission,
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
