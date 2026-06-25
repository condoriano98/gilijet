import { addDays } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { PaymentMethod } from "@prisma/client";
import { requireOperator } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { OPERATOR_TIMEZONE, formatLocalDate } from "@/lib/datetime";
import { formatIDR } from "@/lib/utils";
import { ListPageTemplate } from "@/components/operator-shell/templates/list-page-template";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const CASH_METHODS: PaymentMethod[] = [
  PaymentMethod.BANK_TRANSFER,
  PaymentMethod.VA_BCA,
  PaymentMethod.VA_BNI,
  PaymentMethod.VA_BRI,
  PaymentMethod.VA_MANDIRI,
  PaymentMethod.VA_PERMATA,
];

// Monday 00:00 WITA (as a UTC instant) for the week containing `utc`.
function weekStartMondayUtc(utc: Date): Date {
  const isoDow = Number(formatInTimeZone(utc, OPERATOR_TIMEZONE, "i"));
  const daysSinceMonday = isoDow - 1;
  const ymd = formatInTimeZone(
    addDays(utc, -daysSinceMonday),
    OPERATOR_TIMEZONE,
    "yyyy-MM-dd",
  );
  return fromZonedTime(`${ymd}T00:00:00`, OPERATOR_TIMEZONE);
}

function methodGroup(
  m: PaymentMethod,
): "cash" | "qris" | "card" | "other" {
  if (m === PaymentMethod.QRIS) return "qris";
  if (m === PaymentMethod.CREDIT_CARD) return "card";
  if (CASH_METHODS.includes(m)) return "cash";
  return "other";
}

export default async function PenyelesaianPage() {
  const session = await requireOperator();
  const operatorId = session.sub;

  const thisMonday = weekStartMondayUtc(new Date());
  const weeks = Array.from(
    { length: 8 },
    (_, i) => addDays(thisMonday, -7 * (7 - i)),
  );
  const rangeStart = weeks[0];
  const rangeEnd = addDays(thisMonday, 7);

  const payments = await prisma.payment.findMany({
    where: {
      status: "SUCCESSFUL",
      paidAt: { gte: rangeStart, lt: rangeEnd },
      booking: { operatorId },
    },
    select: { amount: true, method: true, paidAt: true },
  });

  const buckets = new Map<string, { cash: number; qris: number; card: number }>();
  for (const w of weeks) {
    buckets.set(w.toISOString(), { cash: 0, qris: 0, card: 0 });
  }
  for (const p of payments) {
    const key = weekStartMondayUtc(p.paidAt ?? new Date()).toISOString();
    const b = buckets.get(key);
    if (!b) continue;
    const g = methodGroup(p.method);
    if (g === "other") continue;
    b[g] += Number(p.amount);
  }

  const rows = weeks.map((w) => {
    const b = buckets.get(w.toISOString())!;
    return {
      id: w.toISOString(),
      label: `${formatLocalDate(w, "dd MMM")} – ${formatLocalDate(addDays(w, 6), "dd MMM yyyy")}`,
      cash: b.cash,
      qris: b.qris,
      card: b.card,
      total: b.cash + b.qris + b.card,
    };
  });

  const totals = rows.reduce(
    (acc, r) => ({
      cash: acc.cash + r.cash,
      qris: acc.qris + r.qris,
      card: acc.card + r.card,
      total: acc.total + r.total,
    }),
    { cash: 0, qris: 0, card: 0, total: 0 },
  );

  return (
    <ListPageTemplate
      title="Penyelesaian"
      subtitle="Rekap penjualan per metode pembayaran (8 minggu terakhir, Senin–Minggu WITA)"
      secondaryActions={[{ label: "Kembali", href: "/operator/kas" }]}
    >
      <div className="overflow-x-auto rounded-lg border border-mekari-neutral-200 mekari-shadow">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Minggu</TableHead>
              <TableHead className="text-right">Kas/Bank</TableHead>
              <TableHead className="text-right">QRIS</TableHead>
              <TableHead className="text-right">Kartu</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="text-mekari-neutral-700">{r.label}</TableCell>
                <TableCell className="text-right tabular-nums">{formatIDR(r.cash)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatIDR(r.qris)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatIDR(r.card)}</TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {formatIDR(r.total)}
                </TableCell>
              </TableRow>
            ))}
            <TableRow className="bg-mekari-neutral-50 font-semibold">
              <TableCell>Total</TableCell>
              <TableCell className="text-right tabular-nums">{formatIDR(totals.cash)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatIDR(totals.qris)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatIDR(totals.card)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatIDR(totals.total)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </ListPageTemplate>
  );
}
