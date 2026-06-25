"use server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireOperator } from "@/lib/auth";
import { redirect } from "next/navigation";

const updateProfileSchema = z.object({
  companyName: z.string().min(2),
  contactPerson: z.string().min(2),
  phoneNumber: z.string().min(5),
  npwp: z.string().optional(),
});

export async function updateProfile(input: z.infer<typeof updateProfileSchema>) {
  const session = await requireOperator();
  await prisma.operator.update({
    where: { id: session.sub },
    data: {
      companyName: input.companyName,
      contactPerson: input.contactPerson,
      phoneNumber: input.phoneNumber,
      npwp: input.npwp || null,
    },
  });
  redirect("/operator/pengaturan?tab=profil&ok=saved");
}
