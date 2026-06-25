import { PaymentMethod } from "@prisma/client";
import { requireOperator } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatLocalDateTime, formatLocalTime } from "@/lib/datetime";
import { formatIDR } from "@/lib/utils";
import { ListPageTemplate } from "@/components/operator-shell/templates/list-page-template";
import { KpiCard } from "@/components/ui/kpi-card";
import { DataTable } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { Wallet, Banknote, Calculator, Clock } from "lucide-react";
import { OpenShiftForm, CloseShiftForm } from "./kas-forms";

const CASH_DRAWER_METHODS: PaymentMethod[] = [
  PaymentMethod.BANK_TRANSFER,
  PaymentMethod.VA_BCA,
  PaymentMethod.VA_BNI,
  PaymentMethod.VA_BRI,
  PaymentMethod.VA_MANDIRI,
  PaymentMethod.VA_PERMATA,
];

export default async function KasPage() {
  const session = await requireOperator();
  const operatorId = session.sub;

  const [activeSession, staff, closedSessions] = await Promise.all([
    prisma.cashDrawerSession.findFirst({
      where: { operatorId, closedAt: null },
      include: { staff: true },
      orderBy: { openedAt: "desc" },
    }),
    prisma.operatorStaff.findMany({
      where: { operatorId, status: "ACTIVE", deletedAt: null },
      orderBy: { fullName: "asc" },
    }),
    prisma.cashDrawerSession.findMany({
      where: { operatorId, closedAt: { not: null } },
      include: { staff: true },
      orderBy: { closedAt: "desc" },
      take: 20,
    }),
  ]);

  let runningCash = 0;
  if (activeSession) {
    const agg = await prisma.booking.aggregate({
      where: {
        operatorId,
        salesChannel: "WALK_IN",
        createdAt: { gte: activeSession.openedAt },
        cashCollected: { not: null },
        payment: { method: { in: CASH_DRAWER_METHODS } },
      },
      _sum: { cashCollected: true },
    });
    runningCash = Number(agg._sum.cashCollected ?? 0);
  }

  const expectedCash = activeSession
    ? Number(activeSession.openingBalance) + runningCash
    : 0;

  type ClosedRow = (typeof closedSessions)[number];

  const closedColumns = [
    {
      key: "id",
      header: "Sesi",
      render: (r: ClosedRow) => (
        <span className="font-mono text-xs text-mekari-neutral-500">{r.id.slice(-8)}</span>
      ),
    },
    {
      key: "staff",
      header: "Staf",
      render: (r: ClosedRow) => r.staff.fullName,
    },
    {
      key: "openedAt",
      header: "Dibuka",
      render: (r: ClosedRow) => formatLocalDateTime(r.openedAt),
    },
    {
      key: "closedAt",
      header: "Ditutup",
      render: (r: ClosedRow) => (r.closedAt ? formatLocalTime(r.closedAt) : "-"),
    },
    {
      key: "openingBalance",
      header: "Saldo Awal",
      align: "right" as const,
      render: (r: ClosedRow) => formatIDR(Number(r.openingBalance)),
    },
    {
      key: "expectedCash",
      header: "Diharapkan",
      align: "right" as const,
      render: (r: ClosedRow) => formatIDR(Number(r.expectedCash)),
    },
    {
      key: "closingBalanceCounted",
      header: "Dihitung",
      align: "right" as const,
      render: (r: ClosedRow) =>
        r.closingBalanceCounted ? formatIDR(Number(r.closingBalanceCounted)) : "-",
    },
    {
      key: "variance",
      header: "Selisih",
      align: "right" as const,
      render: (r: ClosedRow) => {
        const v = r.variance ? Number(r.variance) : null;
        if (v === null) return "-";
        const variant = v === 0 ? "neutral" : v > 0 ? "warning" : "danger";
        return <StatusBadge variant={variant}>{formatIDR(v)}</StatusBadge>;
      },
    },
  ];

  return (
    <ListPageTemplate
      title="Kas & Bank"
      subtitle="Sesi laci kas dan rekonsiliasi"
      secondaryActions={[
        { label: "Rekonsiliasi", href: "/operator/kas/rekonsiliasi" },
        { label: "Penyelesaian", href: "/operator/kas/penyelesaian" },
      ]}
      kpis={
        activeSession ? (
          <>
            <KpiCard
              label="Saldo Awal"
              value={formatIDR(Number(activeSession.openingBalance))}
              icon={<Wallet size={20} />}
              accent="blue"
            />
            <KpiCard
              label="Kas Berjalan"
              value={formatIDR(runningCash)}
              icon={<Banknote size={20} />}
              accent="green"
            />
            <KpiCard
              label="Kas Diharapkan"
              value={formatIDR(expectedCash)}
              icon={<Calculator size={20} />}
              accent="orange"
            />
            <KpiCard
              label="Dibuka Pada"
              value={formatLocalDateTime(activeSession.openedAt)}
              icon={<Clock size={20} />}
              accent="blue"
              hint={`Staf: ${activeSession.staff.fullName}`}
            />
          </>
        ) : (
          <KpiCard
            label="Status Shift"
            value="Belum dibuka"
            hint="Buka shift untuk mulai mencatat kas"
            accent="orange"
          />
        )
      }
    >
      {activeSession ? (
        <div className="space-y-6">
          <CloseShiftForm
            sessionId={activeSession.id}
            staffName={activeSession.staff.fullName}
            openedAt={activeSession.openedAt.toISOString()}
            openingBalance={Number(activeSession.openingBalance)}
            runningCash={runningCash}
          />
          <div>
            <h2 className="mb-3 text-lg font-semibold text-mekari-neutral-900">
              Sesi Terakhir
            </h2>
            <DataTable
              columns={closedColumns}
              data={closedSessions}
              emptyMessage="Belum ada sesi yang ditutup"
            />
          </div>
        </div>
      ) : (
        <OpenShiftForm staff={staff.map((s) => ({ id: s.id, fullName: s.fullName }))} />
      )}
    </ListPageTemplate>
  );
}
