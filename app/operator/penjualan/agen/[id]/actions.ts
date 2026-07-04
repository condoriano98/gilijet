"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireOperator } from "@/lib/auth";

export async function markAgentPayoutPaid(agentId: string) {
  const session = await requireOperator();
  const operatorId = session.sub;

  const agent = await prisma.travelAgent.findFirst({
    where: { id: agentId, operatorId, deletedAt: null },
    select: { name: true },
  });
  if (!agent) throw new Error("Agen tidak ditemukan");

  await prisma.operatorNotification.create({
    data: {
      operatorId,
      kind: "AGENT_PAYOUT_DUE",
      severity: "INFO",
      title: "Pembayaran Komisi Agen",
      body: `Komisi untuk ${agent.name} telah ditandai dibayar`,
      readAt: new Date(),
      actionUrl: `/operator/penjualan/agen/${agentId}`,
    },
  });

  revalidatePath(`/operator/penjualan/agen/${agentId}`);
}
