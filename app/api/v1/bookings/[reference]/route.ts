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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ reference: string }> },
) {
  const agent = await authenticateAgent(req);
  if (!agent) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { reference } = await params;
  const booking = await prisma.booking.findUnique({
    where: { bookingReference: reference },
    include: {
      leg: { include: { schedule: { include: { boat: true } } } },
      tickets: true,
      payment: true,
    },
  });

  if (!booking || booking.agentId !== agent.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ booking });
}
