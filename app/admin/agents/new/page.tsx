import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireSuperAdmin, hashPassword } from "@/lib/auth";
import { generateApiKey } from "@/lib/agent-auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";

export const metadata = { title: "Onboard Agent · Admin · Gilijet" };

const agentSchema = z.object({
  companyName: z.string().min(2),
  contactPerson: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  commissionRate: z.coerce.number().min(0).max(0.5),
  bankName: z.string().min(2),
  accountNumber: z.string().min(5),
  accountHolder: z.string().min(2),
});

async function onboardAgentAction(formData: FormData) {
  "use server";
  await requireSuperAdmin();

  const parsed = agentSchema.safeParse({
    companyName: formData.get("companyName"),
    contactPerson: formData.get("contactPerson"),
    email: formData.get("email"),
    password: formData.get("password"),
    commissionRate: formData.get("commissionRate"),
    bankName: formData.get("bankName"),
    accountNumber: formData.get("accountNumber"),
    accountHolder: formData.get("accountHolder"),
  });

  if (!parsed.success) {
    redirect(`/admin/agents/new?error=${encodeURIComponent(parsed.error.issues[0].message)}`);
  }

  const passwordHash = await hashPassword(parsed.data.password);
  const { plain: apiKey, hash: apiKeyHash } = generateApiKey();

  const agent = await prisma.agent.create({
    data: {
      companyName: parsed.data.companyName,
      contactPerson: parsed.data.contactPerson,
      email: parsed.data.email,
      passwordHash,
      apiKeyHash,
      commissionRate: parsed.data.commissionRate,
      status: "ACTIVE",
      bankAccountInfo: {
        bankName: parsed.data.bankName,
        accountNumber: parsed.data.accountNumber,
        accountHolder: parsed.data.accountHolder,
      },
    },
  });

  redirect(`/admin/agents?ok=agent_created&apiKey=${apiKey}&agentId=${agent.id}`);
}

export default async function NewAgentPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireSuperAdmin();
  const { error } = await searchParams;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <Link href="/admin/agents" className="text-sm text-slate-600 hover:underline">
          ← Back to agents
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Onboard New Agent</CardTitle>
          <CardDescription>
            Create a new B2B agent account with API access
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error ? (
            <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}

          <form action={onboardAgentAction} className="space-y-6">
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-slate-900">Company Details</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="companyName">Company Name *</Label>
                  <Input id="companyName" name="companyName" required />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="contactPerson">Contact Person *</Label>
                  <Input id="contactPerson" name="contactPerson" required />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="email">Email *</Label>
                  <Input id="email" name="email" type="email" required />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="password">Password *</Label>
                  <Input id="password" name="password" type="password" required minLength={8} />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="commissionRate">Commission Rate (0-0.5) *</Label>
                <Input
                  id="commissionRate"
                  name="commissionRate"
                  type="number"
                  step="0.01"
                  min="0"
                  max="0.5"
                  defaultValue="0.03"
                  required
                />
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-slate-900">Bank Account</h3>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1">
                  <Label htmlFor="bankName">Bank Name *</Label>
                  <Input id="bankName" name="bankName" required />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="accountNumber">Account Number *</Label>
                  <Input id="accountNumber" name="accountNumber" required />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="accountHolder">Account Holder *</Label>
                  <Input id="accountHolder" name="accountHolder" required />
                </div>
              </div>
            </div>

            <Button type="submit">Create Agent</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
