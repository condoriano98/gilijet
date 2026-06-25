"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { EFakturStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireOperator } from "@/lib/auth";
import { audit } from "@/lib/audit";

const transitionSchema = z.object({
  bookingId: z.string(),
  newStatus: z.enum(["DRAFT", "SUBMITTED", "ACCEPTED", "REJECTED"]),
  note: z.string().optional(),
});

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  NOT_REQUIRED: ["DRAFT"],
  DRAFT: ["SUBMITTED"],
  SUBMITTED: ["ACCEPTED", "REJECTED"],
};

export async function transitionEFaktur(input: z.infer<typeof transitionSchema>) {
  const session = await requireOperator();
  const parsed = transitionSchema.safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);

  const { bookingId, newStatus, note } = parsed.data;

  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, operatorId: session.sub },
    select: { id: true, eFakturStatus: true },
  });
  if (!booking) throw new Error("Booking tidak ditemukan");

  const allowed = ALLOWED_TRANSITIONS[booking.eFakturStatus] ?? [];
  if (!allowed.includes(newStatus)) {
    throw new Error(
      `Transisi tidak valid: ${booking.eFakturStatus} → ${newStatus}`,
    );
  }

  const previousStatus = booking.eFakturStatus;

  await prisma.booking.update({
    where: { id: bookingId },
    data: { eFakturStatus: newStatus as EFakturStatus },
  });

  await audit({
    entityType: "BOOKING",
    entityId: bookingId,
    action: "efaktur_status_transitioned",
    userId: session.sub,
    userRole: "OPERATOR",
    previousState: { eFakturStatus: previousStatus },
    newState: { eFakturStatus: newStatus, note: note ?? null },
  });

  redirect("/operator/akuntansi");
}
