import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyApiKey } from "@/lib/agent-auth";

async function authenticateAgent(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const apiKey = authHeader.slice(7);

  const agents = await prisma.agent.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, apiKeyHash: true },
  });

  for (const agent of agents) {
    if (verifyApiKey(apiKey, agent.apiKeyHash)) {
      return { id: agent.id };
    }
  }
  return null;
}

export async function GET(req: NextRequest) {
  const agent = await authenticateAgent(req);
  if (!agent) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const bookings = await prisma.booking.findMany({
    where: {
      agentId: agent.id,
      status: "CONFIRMED",
    },
    select: {
      agentCommissionAmount: true,
      totalAmount: true,
      createdAt: true,
    },
  });

  const totalCommission = bookings.reduce(
    (sum, b) => sum + Number(b.agentCommissionAmount),
    0,
  );
  const totalSales = bookings.reduce(
    (sum, b) => sum + Number(b.totalAmount),
    0,
  );

  return NextResponse.json({
    totalCommission,
    totalSales,
    bookingCount: bookings.length,
  });
}
