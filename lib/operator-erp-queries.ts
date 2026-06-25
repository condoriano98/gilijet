import { prisma } from "./db";
import { computeErpFee } from "./erp-pricing";

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
  const bookings = await prisma.booking.findMany({
    where: {
      operatorId,
      status: "CONFIRMED",
      createdAt: { gte: yearStart },
      salesChannel: { not: "GILIJET" },
    },
    select: { totalAmount: true, tickets: { select: { id: true } } },
    take: 5000,
  });
  if (bookings.length === 0) return 0;
  const totalTickets = bookings.reduce((s, b) => s + b.tickets.length, 0);
  const totalRevenue = bookings.reduce((s, b) => s + Number(b.totalAmount), 0);
  const avgTicket = totalTickets > 0 ? totalRevenue / totalTickets : 0;
  return computeErpFee({ ticketCount: totalTickets, avgTicketIDR: avgTicket }).totalFee;
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

export async function occupancyByRoute(
  operatorId: string,
  from: Date,
  to: Date,
): Promise<Array<{ originPort: string; destinationPort: string; occupancyPct: number }>> {
  const legs = await prisma.leg.findMany({
    where: {
      operatorId,
      departureDate: { gte: from, lte: to },
      schedule: { deletedAt: null, boat: { deletedAt: null } },
    },
    include: { schedule: { select: { originPort: true, destinationPort: true } } },
  });
  const routeMap = new Map<string, { totalCap: number; totalSold: number }>();
  for (const leg of legs) {
    const key = `${leg.schedule.originPort}|${leg.schedule.destinationPort}`;
    const existing = routeMap.get(key) ?? { totalCap: 0, totalSold: 0 };
    existing.totalCap += leg.totalCapacity;
    existing.totalSold += leg.totalCapacity - leg.availableSeats;
    routeMap.set(key, existing);
  }
  return Array.from(routeMap.entries()).map(([key, val]) => {
    const [originPort, destinationPort] = key.split("|");
    return {
      originPort,
      destinationPort,
      occupancyPct: val.totalCap > 0 ? Math.round((val.totalSold / val.totalCap) * 100) : 0,
    };
  });
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