"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { PaymentMethod } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireOperator } from "@/lib/auth";
import { audit } from "@/lib/audit";

// Bank-transfer family treated as cash-equivalent for the drawer: physical
// settlement confirmed at the counter. Adjust here if a real CASH method is
// added to the PaymentMethod enum later.
const CASH_DRAWER_METHODS: PaymentMethod[] = [
  PaymentMethod.BANK_TRANSFER,
  PaymentMethod.VA_BCA,
  PaymentMethod.VA_BNI,
  PaymentMethod.VA_BRI,
  PaymentMethod.VA_MANDIRI,
  PaymentMethod.VA_PERMATA,
];

async function cashCollectedSince(operatorId: string, since: Date): Promise<number> {
  const agg = await prisma.booking.aggregate({
    where: {
      operatorId,
      salesChannel: "WALK_IN",
      createdAt: { gte: since },
      cashCollected: { not: null },
      payment: { method: { in: CASH_DRAWER_METHODS } },
    },
    _sum: { cashCollected: true },
  });
  return Number(agg._sum.cashCollected ?? 0);
}

const openShiftSchema = z.object({
  staffId: z.string().min(1, "Pilih staf"),
  openingBalance: z.number().nonnegative("Saldo awal tidak boleh negatif"),
});

export async function openShift(input: z.infer<typeof openShiftSchema>) {
  const session = await requireOperator();
  const parsed = openShiftSchema.safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);

  const existing = await prisma.cashDrawerSession.findFirst({
    where: { operatorId: session.sub, closedAt: null },
  });
  if (existing) throw new Error("Masih ada shift yang terbuka untuk operator ini");

  const staff = await prisma.operatorStaff.findFirst({
    where: { id: parsed.data.staffId, operatorId: session.sub, deletedAt: null },
  });
  if (!staff) throw new Error("Staf tidak ditemukan");

  const drawer = await prisma.cashDrawerSession.create({
    data: {
      operatorId: session.sub,
      staffId: staff.id,
      openedAt: new Date(),
      openingBalance: parsed.data.openingBalance,
    },
  });

  await audit({
    entityType: "OPERATOR",
    entityId: drawer.id,
    action: "cash_shift_opened",
    userId: session.sub,
    userRole: "OPERATOR",
    newState: { staffId: staff.id, openingBalance: parsed.data.openingBalance },
  });

  redirect("/operator/kas");
}

const closeShiftSchema = z.object({
  sessionId: z.string().min(1, "ID sesi hilang"),
  closingBalanceCounted: z.number().nonnegative("Saldo terhitung tidak boleh negatif"),
});

export async function closeShift(input: z.infer<typeof closeShiftSchema>) {
  const session = await requireOperator();
  const parsed = closeShiftSchema.safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);

  const drawer = await prisma.cashDrawerSession.findFirst({
    where: { id: parsed.data.sessionId, operatorId: session.sub, closedAt: null },
  });
  if (!drawer) throw new Error("Sesi kas tidak ditemukan atau sudah ditutup");

  const expectedCash =
    Number(drawer.openingBalance) +
    (await cashCollectedSince(session.sub, drawer.openedAt));
  const variance = parsed.data.closingBalanceCounted - expectedCash;

  await prisma.cashDrawerSession.update({
    where: { id: drawer.id },
    data: {
      closedAt: new Date(),
      closingBalanceCounted: parsed.data.closingBalanceCounted,
      expectedCash,
      variance,
    },
  });

  await audit({
    entityType: "OPERATOR",
    entityId: drawer.id,
    action: "cash_shift_closed",
    userId: session.sub,
    userRole: "OPERATOR",
    newState: {
      expectedCash,
      closingBalanceCounted: parsed.data.closingBalanceCounted,
      variance,
    },
  });

  redirect("/operator/kas");
}
