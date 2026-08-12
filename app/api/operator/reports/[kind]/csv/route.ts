import { NextRequest } from "next/server";
import { requireOperator } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatLocalDate } from "@/lib/datetime";
import { salesChannelLabel, SALES_CHANNELS } from "@/lib/sales-channel";
import {
  revenueByChannel,
  occupancyByRoute,
  refundRatioByMonth,
} from "@/lib/operator-erp-queries";

const VALID_KINDS = new Set([
  "revenue-by-channel",
  "occupancy-by-route",
  "refund-ratio",
  "agent-leaderboard",
  "cancellation-weather",
]);

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
];

function ymLabel(ym: string): string {
  const [y, m] = ym.split("-");
  return `${MONTH_NAMES[Number(m) - 1]} ${y}`;
}

function csvEscape(v: string | number): string {
  const s = String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function toCsv(rows: (string | number)[][]): string {
  return rows.map((r) => r.map(csvEscape).join(",")).join("\r\n");
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ kind: string }> },
) {
  const { kind } = await params;
  if (!VALID_KINDS.has(kind)) return new Response("Not found", { status: 404 });

  const session = await requireOperator();
  const operatorId = session.sub;

  const now = new Date();
  const rangeFrom = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const rangeTo = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  let header: (string | number)[] = [];
  let rows: (string | number)[][] = [];
  let filename = `${kind}.csv`;

  if (kind === "revenue-by-channel") {
    const months: { label: string; start: Date; end: Date }[] = [];
    for (let i = 5; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      const ym = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`;
      months.push({ label: ymLabel(ym), start, end });
    }
    const perMonth = await Promise.all(
      months.map((m) => revenueByChannel(operatorId, m.start, m.end)),
    );
    const present = new Set<string>();
    for (const rec of perMonth) for (const k of Object.keys(rec)) present.add(k);
    const channels = SALES_CHANNELS.filter((c) => present.has(c));
    header = ["Saluran", ...months.map((m) => m.label), "Total"];
    rows = channels.map((ch) => {
      const vals = perMonth.map((rec) => rec[ch] ?? 0);
      const total = vals.reduce((s, v) => s + v, 0);
      return [salesChannelLabel(ch), ...vals, total];
    });
  } else if (kind === "occupancy-by-route") {
    const routes = await occupancyByRoute(operatorId, rangeFrom, rangeTo);
    header = ["Rute", "Okupansi (%)"];
    rows = routes.map((r) => [
      `${r.originPort} → ${r.destinationPort}`,
      r.occupancyPct,
    ]);
  } else if (kind === "refund-ratio") {
    const data = await refundRatioByMonth(operatorId, rangeFrom, rangeTo);
    header = ["Bulan", "Rasio Refund"];
    rows = data.map((d) => [ymLabel(d.month), `${(d.ratio * 100).toFixed(2)}%`]);
  } else if (kind === "agent-leaderboard") {
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
    const ranked = agents
      .map((a) => {
        const v = commMap.get(a.id);
        return {
          name: a.name,
          bookings: v?.bookings ?? 0,
          commission: v?.commission ?? 0,
        };
      })
      .sort((x, y) => y.commission - x.commission)
      .slice(0, 10);
    header = ["Peringkat", "Nama Agen", "Booking", "Komisi YTD (IDR)"];
    rows = ranked.map((r, i) => [i + 1, r.name, r.bookings, r.commission]);
  } else if (kind === "cancellation-weather") {
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
    const months = [
      ...new Set([...cancelByMonth.keys(), ...badWeatherByMonth.keys()]),
    ].sort().reverse();
    header = ["Bulan", "Pembatalan", "Snapshot Cuaca Buruk"];
    rows = months.map((m) => [
      ymLabel(m),
      cancelByMonth.get(m) ?? 0,
      badWeatherByMonth.get(m) ?? 0,
    ]);
  }

  const csv = toCsv([header, ...rows]);
  const dateStr = new Date().toISOString().slice(0, 10);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${kind}-${dateStr}.csv"`,
    },
  });
}

export const dynamic = "force-dynamic";
