import { prisma } from "./db";
import type { AgentTier } from "@prisma/client";

export const AGENT_COMMISSION_RATES: Record<AgentTier, number> = {
  BRONZE:   0.05,
  SILVER:   0.07,
  GOLD:     0.10,
  PLATINUM: 0.15,
};

export async function createAgentBooking(args: {
  agentId: string;
  bookingId: string;
}): Promise<void> {
  const agent = await prisma.agent.findUnique({
    where: { id: args.agentId },
  });
  if (!agent) throw new Error("Agent not found");

  const booking = await prisma.booking.findUnique({
    where: { id: args.bookingId },
  });
  if (!booking) throw new Error("Booking not found");

  await prisma.booking.update({
    where: { id: args.bookingId },
    data: { agentId: args.agentId },
  });

  await prisma.agent.update({
    where: { id: args.agentId },
    data: {
      totalBookings: { increment: 1 },
      totalRevenue: { increment: Number(booking.totalAmount) },
    },
  });
}

export async function upgradeAgentTier(
  agentId: string,
  newTier: AgentTier,
): Promise<void> {
  await prisma.agent.update({
    where: { id: agentId },
    data: {
      tier: newTier,
      commissionRate: AGENT_COMMISSION_RATES[newTier],
    },
  });
}
