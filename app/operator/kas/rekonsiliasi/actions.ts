"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireOperator } from "@/lib/auth";
import { audit } from "@/lib/audit";

const saveNoteSchema = z.object({
  sessionId: z.string().min(1, "ID sesi hilang"),
  notes: z.string().max(1000, "Catatan terlalu panjang"),
});

export async function saveReconciliationNote(
  input: z.infer<typeof saveNoteSchema>,
) {
  const session = await requireOperator();
  const parsed = saveNoteSchema.safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);

  const drawer = await prisma.cashDrawerSession.findFirst({
    where: { id: parsed.data.sessionId, operatorId: session.sub },
    select: { id: true },
  });
  if (!drawer) throw new Error("Sesi kas tidak ditemukan");

  const notes = parsed.data.notes.trim();
  await prisma.cashDrawerSession.update({
    where: { id: drawer.id },
    data: { notes: notes || null },
  });

  await audit({
    entityType: "OPERATOR",
    entityId: drawer.id,
    action: "cash_reconciliation_note",
    userId: session.sub,
    userRole: "OPERATOR",
    newState: { notes },
  });

  revalidatePath("/operator/kas/rekonsiliasi");
}
