import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
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
import { Textarea } from "@/components/ui/textarea";

export const metadata = { title: "New promo · Admin" };

const promoSchema = z.object({
  code: z.string().min(3).max(40).regex(/^[A-Z0-9_-]+$/, "Code must be uppercase letters, digits, _ or -"),
  discountType: z.enum(["PERCENT", "FLAT"]),
  discountValue: z.coerce.number().positive(),
  minAmount: z.coerce.number().min(0).default(0),
  maxUses: z.coerce.number().int().positive().optional().or(z.literal("")),
  expiresAt: z.string().optional().or(z.literal("")),
  description: z.string().max(200).optional().or(z.literal("")),
});

async function createPromoAction(formData: FormData) {
  "use server";
  const session = await requireAdmin();

  const codeRaw = String(formData.get("code") ?? "").trim().toUpperCase();
  const parsed = promoSchema.safeParse({
    code: codeRaw,
    discountType: formData.get("discountType"),
    discountValue: formData.get("discountValue"),
    minAmount: formData.get("minAmount") || 0,
    maxUses: formData.get("maxUses") || "",
    expiresAt: formData.get("expiresAt") || "",
    description: formData.get("description") || "",
  });
  if (!parsed.success) {
    redirect(
      `/admin/promos/new?error=${encodeURIComponent(parsed.error.issues[0].message)}`,
    );
  }

  if (parsed.data.discountType === "PERCENT" && parsed.data.discountValue > 100) {
    redirect(
      `/admin/promos/new?error=${encodeURIComponent("Percent discount cannot exceed 100")}`,
    );
  }

  const existing = await prisma.promotion.findUnique({
    where: { code: parsed.data.code },
  });
  if (existing) {
    redirect(
      `/admin/promos/new?error=${encodeURIComponent("Code already exists")}`,
    );
  }

  const promo = await prisma.promotion.create({
    data: {
      code: parsed.data.code,
      discountType: parsed.data.discountType,
      discountValue: parsed.data.discountValue,
      minAmount: parsed.data.minAmount,
      maxUses:
        typeof parsed.data.maxUses === "number"
          ? parsed.data.maxUses
          : null,
      expiresAt:
        typeof parsed.data.expiresAt === "string" && parsed.data.expiresAt
          ? new Date(parsed.data.expiresAt)
          : null,
      description: parsed.data.description?.trim() || null,
      isActive: true,
    },
  });

  await audit({
    entityType: "promotion",
    entityId: promo.id,
    action: "created",
    userId: session.sub,
    userRole: "admin",
    newState: { code: promo.code },
  });

  redirect("/admin/promos");
}

export default async function NewPromoPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireAdmin();
  const { error } = await searchParams;

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold tracking-tight">New promotion</h1>
        <Link href="/admin/promos" className="text-sm text-sky-700 hover:underline">
          ← All promos
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Promo details</CardTitle>
          <CardDescription>
            Customers enter the code at checkout to apply the discount.
          </CardDescription>
        </CardHeader>
        <form action={createPromoAction}>
          <CardContent className="space-y-4">
            {error ? (
              <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="code">Code</Label>
                <Input
                  id="code"
                  name="code"
                  required
                  placeholder="GILIJET15"
                  pattern="[A-Z0-9_-]{3,40}"
                  className="font-mono uppercase"
                />
                <p className="text-xs text-muted-foreground">
                  Uppercase letters, digits, _ or -. 3-40 chars.
                </p>
              </div>
              <div className="space-y-1">
                <Label htmlFor="discountType">Type</Label>
                <select
                  id="discountType"
                  name="discountType"
                  required
                  defaultValue="PERCENT"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="PERCENT">Percent off</option>
                  <option value="FLAT">Flat IDR off</option>
                </select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="discountValue">Discount value</Label>
                <Input
                  id="discountValue"
                  name="discountValue"
                  type="number"
                  required
                  min={1}
                  step={1}
                  placeholder="15"
                />
                <p className="text-xs text-muted-foreground">
                  For PERCENT, enter 1-100. For FLAT, enter IDR amount.
                </p>
              </div>
              <div className="space-y-1">
                <Label htmlFor="minAmount">Minimum spend (IDR, optional)</Label>
                <Input
                  id="minAmount"
                  name="minAmount"
                  type="number"
                  min={0}
                  step={10000}
                  placeholder="0"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="maxUses">Max uses (optional)</Label>
                <Input
                  id="maxUses"
                  name="maxUses"
                  type="number"
                  min={1}
                  step={1}
                  placeholder="Unlimited"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="expiresAt">Expires (optional)</Label>
                <Input id="expiresAt" name="expiresAt" type="date" />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                name="description"
                rows={2}
                maxLength={200}
                placeholder="Save 15% on Gili Islands routes"
              />
            </div>

            <div className="flex gap-2">
              <Button type="submit">Create promotion</Button>
              <Button asChild type="button" variant="outline">
                <Link href="/admin/promos">Cancel</Link>
              </Button>
            </div>
          </CardContent>
        </form>
      </Card>
    </div>
  );
}
