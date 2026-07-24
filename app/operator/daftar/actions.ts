"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getOperatorSession, hashPassword, setOperatorSession, type OperatorSession } from "@/lib/auth";

const operatorSignupSchema = z.object({
  companyName: z.string().min(3).max(100),
  contactPerson: z.string().min(3).max(100),
  email: z.string().email(),
  phoneNumber: z.string().min(10).max(20),
  password: z.string().min(8),
  confirmPassword: z.string().min(8),
}).refine(d => d.password === d.confirmPassword, {
  message: "Passwords must match",
  path: ["confirmPassword"],
});

const bankAccountSchema = z.object({
  bankName: z.string().min(3).max(100),
  accountNumber: z.string().min(8).max(30),
  accountHolder: z.string().min(3).max(100),
});

export async function createOperatorAccount(formData: FormData) {
  const parsed = operatorSignupSchema.safeParse({
    companyName: formData.get("companyName"),
    contactPerson: formData.get("contactPerson"),
    email: formData.get("email"),
    phoneNumber: formData.get("phoneNumber"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    redirect(`/operator/daftar?step=1&error=${encodeURIComponent(parsed.error.issues[0].message)}`);
  }

  let operator;
  try {
    const passwordHash = await hashPassword(parsed.data.password);
    operator = await prisma.operator.create({
      data: {
        email: parsed.data.email.toLowerCase(),
        companyName: parsed.data.companyName,
        contactPerson: parsed.data.contactPerson,
        phoneNumber: parsed.data.phoneNumber,
        passwordHash,
        status: "PENDING",
        bankAccountInfo: {},
      },
    });
  } catch (err) {
    // P2002 = unique constraint violation on email. Concurrent sign-ups with
    // the same email can both pass a pre-check race, so the real guard is
    // this catch, not a findUnique-then-create check.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      redirect(`/operator/daftar?step=1&error=${encodeURIComponent("Email already registered")}`);
    }
    throw err;
  }

  const session: OperatorSession = {
    sub: operator.id,
    role: "operator",
    email: operator.email,
  };
  await setOperatorSession(session);
  redirect("/operator/daftar?step=2");
}

export async function submitBankAccount(formData: FormData) {
  const session = await getOperatorSession();
  if (!session) {
    throw new Error("Not authenticated");
  }

  const parsed = bankAccountSchema.safeParse({
    bankName: formData.get("bankName"),
    accountNumber: formData.get("accountNumber"),
    accountHolder: formData.get("accountHolder"),
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0].message);
  }

  await prisma.operator.update({
    where: { id: session.sub },
    data: {
      bankAccountInfo: parsed.data,
    },
  });

  return { success: true };
}
