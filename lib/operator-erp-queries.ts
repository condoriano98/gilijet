import { prisma } from "./db";
import { computeErpFee } from "./erp-pricing";
import { DIRECT_SALES_CHANNELS } from "./sales-channel";

export async function agentCommissionYtd(operatorId: string): Promise<number> {
  const yearStart = new Date(new Date().getFullYear(), 0, 1);
  const result = await prisma.booking.aggregate({
    where: {
      operatorId,
      status: "CONFIRMED",
      createdAt: { gte: yearStart },
      salesChannel: "TRAVEL_AGENT",
    },
    _sum: { agentCommissionAmount: true },
  });
  return Number(result._sum.agentCommissionAmount ?? 0);
}

export async function erpFeeYtd(operatorId: string): Promise<number> {
  const yearStart = new Date(new Date().getFullYear(), 0, 1);
  // computeErpFee is volume-tiered and per-ticket capped, so it MUST run per
  // booking — collapsing to a blended average over all bookings changes the
  // number (cap applied to the wrong basis, tiers spread across the whole
  // year). Page through all matching bookings with a cursor so operators with
  // more than one batch of YTD bookings are not silently truncated.
  let cursor: string | undefined;
  let totalFee = 0;
  for (;;) {
    const batch = await prisma.booking.findMany({
      where: {
        operatorId,
        status: "CONFIRMED",
        createdAt: { gte: yearStart },
        salesChannel: { notIn: DIRECT_SALES_CHANNELS },
      },
      select: { id: true, totalAmount: true, tickets: { select: { id: true } } },
      orderBy: { id: "asc" },
      take: 1000,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (batch.length === 0) break;
    for (const b of batch) {
      const ticketCount = b.tickets.length;
      if (ticketCount === 0) continue;
      totalFee += computeErpFee({
        ticketCount,
        avgTicketIDR: Number(b.totalAmount) / ticketCount,
      }).totalFee;
    }
    if (batch.length < 1000) break;
    cursor = batch[batch.length - 1].id;
  }
  return totalFee;
}

export async function revenueByChannel(
  operatorId: string,
  from: Date,
  to: Date,
): Promise<Record<string, number>> {
  const rows = await prisma.booking.groupBy({
    by: ["salesChannel"],
    where: { operatorId, status: "CONFIRMED", createdAt: { gte: from, lte: to } },
    _sum: { totalAmount: true },
  });
  const result: Record<string, number> = {};
  for (const row of rows) {
    result[row.salesChannel] = Number(row._sum.totalAmount ?? 0);
  }
  return result;
}

export async function refundRatioByMonth(
  operatorId: string,
  from: Date,
  to: Date,
): Promise<Array<{ month: string; ratio: number }>> {
  const refunds = await prisma.refund.findMany({
    where: {
      booking: { operatorId },
      createdAt: { gte: from, lte: to },
    },
    select: { createdAt: true },
  });
  const bookings = await prisma.booking.findMany({
    where: { operatorId, createdAt: { gte: from, lte: to } },
    select: { createdAt: true },
  });
  const monthRefunds = new Map<string, number>();
  const monthBookings = new Map<string, number>();
  for (const r of refunds) {
    const month = r.createdAt.toISOString().slice(0, 7);
    monthRefunds.set(month, (monthRefunds.get(month) ?? 0) + 1);
  }
  for (const b of bookings) {
    const month = b.createdAt.toISOString().slice(0, 7);
    monthBookings.set(month, (monthBookings.get(month) ?? 0) + 1);
  }
  const months = new Set([...monthRefunds.keys(), ...monthBookings.keys()]);
  return Array.from(months).sort().map((month) => ({
    month,
    ratio: monthBookings.get(month) ? monthRefunds.get(month)! / monthBookings.get(month)! : 0,
  }));
}