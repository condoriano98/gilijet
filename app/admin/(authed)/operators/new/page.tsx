import { redirect } from "next/navigation";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { hashPassword, requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const newOperatorSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  companyName: z.string().min(2),
  contactPerson: z.string().min(2),
  phoneNumber: z.string().min(8),
  bankName: z.string().min(2),
  accountNumber: z.string().min(4),
  accountHolder: z.string().min(2),
  npwp: z.string().optional().or(z.literal("")),
});

async function createOperatorAction(formData: FormData) {
  "use server";
  const session = await requireAdmin();

  const parsed = newOperatorSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    companyName: formData.get("companyName"),
    contactPerson: formData.get("contactPerson"),
    phoneNumber: formData.get("phoneNumber"),
    bankName: formData.get("bankName"),
    accountNumber: formData.get("accountNumber"),
    accountHolder: formData.get("accountHolder"),
    npwp: formData.get("npwp"),
  });
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    redirect(`/admin/operators/new?error=${encodeURIComponent(first.message)}`);
  }

  const data = parsed.data;
  const existing = await prisma.operator.findUnique({
    where: { email: data.email.toLowerCase() },
  });
  if (existing) {
    redirect("/admin/operators/new?error=Email%20already%20in%20use");
  }

  const passwordHash = await hashPassword(data.password);
  const operator = await prisma.operator.create({
    data: {
      email: data.email.toLowerCase(),
      passwordHash,
      companyName: data.companyName,
      contactPerson: data.contactPerson,
      phoneNumber: data.phoneNumber,
      npwp: data.npwp || null,
      bankAccountInfo: {
        bankName: data.bankName,
        accountNumber: data.accountNumber,
        accountHolder: data.accountHolder,
      } satisfies Prisma.InputJsonValue,
      status: "PENDING",
    },
  });

  await audit({
    entityType: "OPERATOR",
    entityId: operator.id,
    action: "created",
    userId: session.sub,
    userRole: "ADMIN",
    newState: { email: operator.email, companyName: operator.companyName },
  });

  redirect(`/admin/operators/${operator.id}`);
}

export default async function NewOperatorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireAdmin();
  const { error } = await searchParams;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Onboard operator</h1>
        <p className="text-sm text-muted-foreground">
          Create the account. Verify the operator&apos;s documents separately,
          then approve from the operator detail page.
        </p>
      </div>

      <form action={createOperatorAction}>
        <Card>
          <CardHeader>
            <CardTitle>Operator details</CardTitle>
            <CardDescription>
              The operator will use the email + password below to sign in to
              their dashboard.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {error ? (
              <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="companyName" label="Company name" required />
              <Field id="contactPerson" label="Contact person" required />
              <Field id="email" type="email" label="Email" required />
              <Field id="phoneNumber" label="Phone (WhatsApp)" required />
              <Field
                id="password"
                type="password"
                label="Temporary password"
                hint="At least 8 characters. Share securely; operator should change it."
                required
              />
              <Field id="npwp" label="NPWP (optional)" />
            </div>

            <div className="border-t pt-4">
              <h3 className="mb-2 text-sm font-semibold">
                Payout bank account
              </h3>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field id="bankName" label="Bank name" required />
                <Field id="accountNumber" label="Account number" required />
                <Field id="accountHolder" label="Account holder" required />
              </div>
            </div>
          </CardContent>
          <CardFooter className="justify-end gap-2">
            <Button type="submit">Create operator</Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  );
}

function Field({
  id,
  label,
  type = "text",
  required,
  hint,
}: {
  id: string;
  label: string;
  type?: string;
  required?: boolean;
  hint?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>
        {label}
        {required ? <span className="ml-1 text-red-500">*</span> : null}
      </Label>
      <Input id={id} name={id} type={type} required={required} />
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
