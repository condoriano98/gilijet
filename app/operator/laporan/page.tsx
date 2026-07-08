import Link from "next/link";
import { requireOperator } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { cn, formatIDR } from "@/lib/utils";
import { formatLocalDate } from "@/lib/datetime";
import { ListPageTemplate } from "@/components/operator-shell/templates/list-page-template";
import { DataTable } from "@/components/ui/data-table";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  revenueByChannel,
  occupancyByRoute,
  refundRatioByMonth,
} from "@/lib/operator-erp-queries";

const TABS = [
  { key: "revenue-by-channel", label: "Pendapatan per Saluran" },
  { key: "occupancy-by-route", label: "Okupansi per Rute" },
  { key: "refund-ratio", label: "Rasio Refund" },
  { key: "agent-leaderboard", label: "Peringkat Agen" },
  { key: "cancellation-weather", label: "Pembatalan & Cuaca" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const CHANNELS = [
  "GILIJET",
  "WALK_IN",
  "TRAVEL_AGENT",
  "PHONE",
  "EXTERNAL_AGGREGATOR",
] as const;

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
];

function channelLabel(ch: string): string {
  const map: Record<string, string> = {
    GILIJET: "Gilibali",
    WALK_IN: "Walk-in",
    TRAVEL_AGENT: "Agen",
    PHONE: "Telepon",
    EXTERNAL_AGGREGATOR: "Aggregator",
  };
  return map[ch] ?? ch;
}

function ymLabel(ym: string): string {
  const [y, m] = ym.split("-");
  return `${MONTH_NAMES[Number(m) - 1]} ${y}`;
}

function monthLabel(d: Date): string {
  return `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}

export default async function LaporanPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await requireOperator();
  const operatorId = session.sub;
  const sp = await searchParams;
  const tab = (TABS.find((t) => t.key === sp.tab)?.key ?? "revenue-by-channel") as TabKey;

  const now = new Date();
  const rangeFrom = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const rangeTo = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  return (
    <ListPageTemplate
      title="Laporan"
      subtitle="Analitik operasi dan keuangan"
      secondaryActions={[{ label: "Ekspor CSV", href: `/api/operator/reports/${tab}/csv` }]}
    >
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/operator/laporan?tab=${t.key}`}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              t.key === tab
                ? "bg-mekari-primary text-white"
                : "bg-mekari-surface text-mekari-neutral-600 hover:bg-mekari-neutral-100",
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {tab === "revenue-by-channel" && (
        <RevenueByChannel operatorId={operatorId} now={now} />
      )}
      {tab === "occupancy-by-route" && (
        <OccupancyByRoute operatorId={operatorId} from={rangeFrom} to={rangeTo} />
      )}
      {tab === "refund-ratio" && (
        <RefundRatio operatorId={operatorId} from={rangeFrom} to={rangeTo} />
      )}
      {tab === "agent-leaderboard" && <AgentLeaderboard operatorId={operatorId} now={now} />}
      {tab === "cancellation-weather" && <CancellationWeather operatorId={operatorId} />}
    </ListPageTemplate>
  );
}

async function RevenueByChannel({
  operatorId,
  now,
}: {
  operatorId: string;
  now: Date;
}) {
  const months: { label: string; start: Date; end: Date }[] = [];
  for (let i = 5; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    months.push({ label: monthLabel(start), start, end });
  }
  const perMonth = await Promise.all(
    months.map((m) => revenueByChannel(operatorId, m.start, m.end)),
  );

  const present = new Set<string>();
  for (const rec of perMonth) for (const k of Object.keys(rec)) present.add(k);
  const channels = CHANNELS.filter((c) => present.has(c));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pendapatan per Saluran (6 bulan terakhir)</CardTitle>
      </CardHeader>
      <CardContent>
        {channels.length === 0 ? (
          <p className="py-8 text-center text-sm text-mekari-neutral-500">
            Belum ada data pendapatan.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-mekari-neutral-200 bg-mekari-neutral-50">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-mekari-neutral-500">
                    Saluran
                  </th>
                  {months.map((m) => (
                    <th
                      key={m.label}
                      className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-mekari-neutral-500"
                    >
                      {m.label}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-mekari-neutral-500">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-mekari-neutral-200">
                {channels.map((ch) => {
                  const vals = perMonth.map((rec) => rec[ch] ?? 0);
                  const total = vals.reduce((s, v) => s + v, 0);
                  return (
                    <tr key={ch} className="bg-mekari-surface">
                      <td className="px-4 py-3 text-mekari-neutral-700">
                        {channelLabel(ch)}
                      </td>
                      {vals.map((v, i) => (
                        <td
                          key={i}
                          className="px-4 py-3 text-right tabular-nums text-mekari-neutral-700"
                        >
                          {formatIDR(v)}
                        </td>
                      ))}
                      <td className="px-4 py-3 text-right tabular-nums font-semibold text-mekari-neutral-900">
                        {formatIDR(total)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

async function OccupancyByRoute({
  operatorId,
  from,
  to,
}: {
  operatorId: string;
  from: Date;
  to: Date;
}) {
  const routes = await occupancyByRoute(operatorId, from, to);
  type Row = { id: string; route: string; occupancyPct: number };
  const rows: Row[] = routes.map((r, i) => ({
    id: String(i),
    route: `${r.originPort} → ${r.destinationPort}`,
    occupancyPct: r.occupancyPct,
  }));
  const columns = [
    { key: "route", header: "Rute" },
    {
      key: "occupancyPct",
      header: "Okupansi",
      align: "right" as const,
      render: (r: Row) => `${r.occupancyPct}%`,
    },
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Okupansi per Rute (6 bulan terakhir)</CardTitle>
      </CardHeader>
      <CardContent>
        <DataTable columns={columns} data={rows} emptyMessage="Belum ada data okupansi" />
      </CardContent>
    </Card>
  );
}

async function RefundRatio({
  operatorId,
  from,
  to,
}: {
  operatorId: string;
  from: Date;
  to: Date;
}) {
  const data = await refundRatioByMonth(operatorId, from, to);
  type Row = { id: string; month: string; ratio: number };
  const rows: Row[] = data.map((d) => ({
    id: d.month,
    month: ymLabel(d.month),
    ratio: d.ratio,
  }));
  const columns = [
    { key: "month", header: "Bulan" },
    {
      key: "ratio",
      header: "Rasio Refund",
      align: "right" as const,
      render: (r: Row) => `${(r.ratio * 100).toFixed(1)}%`,
    },
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Rasio Refund per Bulan (6 bulan terakhir)</CardTitle>
      </CardHeader>
      <CardContent>
        <DataTable columns={columns} data={rows} emptyMessage="Belum ada data refund" />
      </CardContent>
    </Card>
  );
}

async function AgentLeaderboard({
  operatorId,
  now,
}: {
  operatorId: string;
  now: Date;
}) {
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const agents = await prisma.travelAgent.findMany({
    where: { operatorId, deletedAt: null },
    select: { id: true, name: true },
  });
  const agentIds = agents.map((a) => a.id);
  const commissions = agentIds.length
    ? await prisma.booking.groupBy({
        by: ["salesAgentId"],
        where: {
          operatorId,
          status: "CONFIRMED",
          salesAgentId: { in: agentIds },
          createdAt: { gte: yearStart },
        },
        _sum: { agentCommissionAmount: true },
        _count: true,
      })
    : [];
  const commMap = new Map(
    commissions.map((c) => [
      c.salesAgentId,
      { commission: Number(c._sum.agentCommissionAmount ?? 0), bookings: c._count },
    ]),
  );

  type Row = { id: string; rank: number; name: string; bookings: number; commission: number };
  const rows: Row[] = agents
    .map((a) => {
      const v = commMap.get(a.id);
      return {
        id: a.id,
        rank: 0,
        name: a.name,
        bookings: v?.bookings ?? 0,
        commission: v?.commission ?? 0,
      };
    })
    .sort((x, y) => y.commission - x.commission)
    .slice(0, 10)
    .map((r, i) => ({ ...r, rank: i + 1 }));

  const columns = [
    {
      key: "rank",
      header: "#",
      align: "center" as const,
      render: (r: Row) => String(r.rank),
    },
    { key: "name", header: "Nama Agen" },
    {
      key: "bookings",
      header: "Booking",
      align: "right" as const,
      render: (r: Row) => String(r.bookings),
    },
    {
      key: "commission",
      header: "Komisi YTD",
      align: "right" as const,
      render: (r: Row) => formatIDR(r.commission),
    },
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Peringkat Agen (Komisi YTD)</CardTitle>
      </CardHeader>
      <CardContent>
        <DataTable columns={columns} data={rows} emptyMessage="Belum ada agen perjalanan" />
      </CardContent>
    </Card>
  );
}

async function CancellationWeather({ operatorId }: { operatorId: string }) {
  const [cancelledLegs, weather] = await Promise.all([
    prisma.leg.findMany({
      where: { operatorId, status: "CANCELLED" },
      select: { departureDate: true },
      take: 5000,
    }),
    prisma.weatherSnapshot.findMany({
      where: { leg: { operatorId } },
      select: { condition: true, recordedAt: true },
      take: 5000,
    }),
  ]);

  const BAD = new Set(["ROUGH", "SEVERE", "CLOSED"]);
  const cancelByMonth = new Map<string, number>();
  for (const l of cancelledLegs) {
    const m = formatLocalDate(l.departureDate, "yyyy-MM");
    cancelByMonth.set(m, (cancelByMonth.get(m) ?? 0) + 1);
  }
  const badWeatherByMonth = new Map<string, number>();
  for (const w of weather) {
    if (!BAD.has(w.condition)) continue;
    const m = formatLocalDate(w.recordedAt, "yyyy-MM");
    badWeatherByMonth.set(m, (badWeatherByMonth.get(m) ?? 0) + 1);
  }

  const months = [...new Set([...cancelByMonth.keys(), ...badWeatherByMonth.keys()])].sort().reverse();
  type Row = { id: string; month: string; cancellations: number; badWeather: number };
  const rows: Row[] = months.map((m) => ({
    id: m,
    month: ymLabel(m),
    cancellations: cancelByMonth.get(m) ?? 0,
    badWeather: badWeatherByMonth.get(m) ?? 0,
  }));

  const columns = [
    { key: "month", header: "Bulan" },
    {
      key: "cancellations",
      header: "Pembatalan",
      align: "right" as const,
      render: (r: Row) => String(r.cancellations),
    },
    {
      key: "badWeather",
      header: "Snapshot Cuaca Buruk",
      align: "right" as const,
      render: (r: Row) => String(r.badWeather),
    },
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Pembatalan & Konteks Cuaca</CardTitle>
      </CardHeader>
      <CardContent>
        <DataTable columns={columns} data={rows} emptyMessage="Belum ada data pembatalan" />
      </CardContent>
    </Card>
  );
}
