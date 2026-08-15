import { requireOperator } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatLocalDate, formatLocalTime, ymdInZone } from "@/lib/datetime";
import { KpiCard } from "@/components/ui/kpi-card";
import { DataTable } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import {
  Banknote,
  Ticket,
  Ship,
} from "lucide-react";

function formatRupiah(n: number): string {
  return "Rp " + n.toLocaleString("id-ID", { maximumFractionDigits: 0 });
}

function getGreeting(): string {
  const hour = new Date().getUTCHours() + 8;
  const h = hour >= 24 ? hour - 24 : hour;
  if (h >= 5 && h < 11) return "Selamat pagi";
  if (h >= 11 && h < 15) return "Selamat siang";
  if (h >= 15 && h < 18) return "Selamat sore";
  return "Selamat malam";
}

export default async function OperatorDashboard() {
  const session = await requireOperator();
  const operatorId = session.sub;

  const todayYmd = ymdInZone(new Date());
  const todayStart = new Date(`${todayYmd}T00:00:00+08:00`);
  const todayEnd = new Date(`${todayYmd}T23:59:59+08:00`);
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const monthStart = new Date(todayYmd.slice(0, 7) + "-01T00:00:00+08:00");

  const [todayLegs, todayRevenue, weekRevenue, monthRevenue, monthBookings, scheduleCount, boatCount] =
    await Promise.all([
      prisma.leg.findMany({
        where: {
          operatorId,
          departureDate: { gte: todayStart, lte: todayEnd },
          schedule: { deletedAt: null, boat: { deletedAt: null } },
        },
        include: { schedule: { include: { boat: true } } },
        orderBy: { departureDate: "asc" },
      }),
      prisma.booking.aggregate({
        where: { operatorId, status: "CONFIRMED", createdAt: { gte: todayStart, lte: todayEnd } },
        _sum: { operatorAmount: true },
        _count: true,
      }),
      prisma.booking.aggregate({
        where: { operatorId, status: "CONFIRMED", createdAt: { gte: weekAgo } },
        _sum: { operatorAmount: true },
      }),
      prisma.booking.aggregate({
        where: { operatorId, status: "CONFIRMED", createdAt: { gte: monthStart } },
        _sum: { operatorAmount: true },
        _count: true,
      }),
      prisma.booking.findMany({
        where: { operatorId, status: "CONFIRMED", createdAt: { gte: monthStart } },
        include: { leg: { include: { schedule: true } } },
        take: 500,
      }),
      prisma.schedule.count({ where: { status: "ACTIVE", deletedAt: null, boat: { operatorId, deletedAt: null } } }),
      prisma.boat.count({ where: { operatorId, status: "ACTIVE", deletedAt: null } }),
    ]);

  const todayRevenueNum = Number(todayRevenue._sum.operatorAmount ?? 0);
  const weekRevenueNum = Number(weekRevenue._sum.operatorAmount ?? 0);
  const monthRevenueNum = Number(monthRevenue._sum.operatorAmount ?? 0);
  const todayTickets = todayRevenue._count;
  const sailedCount = todayLegs.filter((l) => l.status === "SAILED").length;

  const firstName = session.email.split("@")[0];

  const statusVariant: Record<string, "success" | "warning" | "danger" | "neutral"> = {
    OPEN: "success", FULL: "warning", SAILED: "info" as "success", CANCELLED: "danger",
  };

  const legColumns = [
    { key: "time",   header: "Waktu" },
    { key: "route",  header: "Rute" },
    { key: "boat",   header: "Kapal" },
    { key: "status", header: "Status" },
    { key: "action", header: "Aksi", align: "right" as const },
  ];

  const legRows = todayLegs.map((leg) => ({
    id: leg.id,
    time: <span className="font-mono font-medium">{formatLocalTime(leg.departureDate)}</span>,
    route: `${leg.schedule.originPort} → ${leg.schedule.destinationPort}`,
    boat: leg.schedule.boat.name,
    status: <StatusBadge variant={statusVariant[leg.status] ?? "neutral"}>{leg.status}</StatusBadge>,
    action: (
      <Button asChild variant="outline" size="sm">
        <Link href={`/operator/legs/${leg.id}`}>Lihat Manifest</Link>
      </Button>
    ),
  }));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-mekari-neutral-900">
          {getGreeting()}, {firstName}
        </h1>
        <p className="text-sm text-mekari-neutral-500">
          {formatLocalDate(new Date(), "EEEE, dd MMMM yyyy")}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard
          label="Pendapatan Hari Ini"
          value={formatRupiah(todayRevenueNum)}
          icon={<Banknote size={20} />}
          accent="blue"
        />
        <KpiCard
          label="Tiket Terjual Hari Ini"
          value={String(todayTickets)}
          icon={<Ticket size={20} />}
          accent="green"
        />
        <KpiCard
          label="Keberangkatan Hari Ini"
          value={`${sailedCount} dari ${todayLegs.length}`}
          hint="selesai"
          icon={<Ship size={20} />}
          accent="blue"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Hari Ini — Keberangkatan</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={legColumns}
            data={legRows}
            emptyMessage="Tidak ada keberangkatan hari ini"
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-mekari-neutral-500">Pendapatan 7 Hari</p>
            <p className="mt-1 text-xl font-bold tabular-nums">{formatRupiah(weekRevenueNum)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-mekari-neutral-500">Pendapatan Bulan Ini</p>
            <p className="mt-1 text-xl font-bold tabular-nums">{formatRupiah(monthRevenueNum)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-mekari-neutral-500">Jadwal & Kapal Aktif</p>
            <p className="mt-1 text-xl font-bold tabular-nums">{scheduleCount} jadwal · {boatCount} kapal</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
