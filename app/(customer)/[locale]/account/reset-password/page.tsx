import Link from "next/link";
import { redirect } from "next/navigation";
import { createHash } from "crypto";
import { prisma } from "@/lib/db";
import { hashPassword, setCustomerSession } from "@/lib/auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const metadata = { title: "Reset password · Gilijet" };

async function resetPasswordAction(formData: FormData) {
  "use server";
  const rawToken = String(formData.get("token") ?? "");
  const newPassword = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!rawToken) redirect("/account/forgot-password");

  if (newPassword.length < 8 || newPassword !== confirmPassword) {
    redirect(
      `/account/reset-password?error=invalid&token=${encodeURIComponent(rawToken)}`,
    );
  }

  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
  });

  if (!record || record.usedAt || record.expiresAt < new Date()) {
    redirect("/account/reset-password?error=expired");
  }

  const [customer] = await Promise.all([
    prisma.customer.update({
      where: { email: record.email },
      data: { passwordHash: await hashPassword(newPassword) },
    }),
    prisma.passwordResetToken.update({
      where: { tokenHash },
      data: { usedAt: new Date() },
    }),
  ]);

  await setCustomerSession({
    sub: customer.id,
    role: "customer",
    email: customer.email,
    fullName: customer.fullName,
  });

  redirect("/account?ok=password_changed");
}

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await searchParams;

  if (!token && error !== "expired") {
    redirect("/account/forgot-password");
  }

  if (error === "expired") {
    return (
      <div className="container py-12">
        <div className="mx-auto max-w-md">
          <Card>
            <CardHeader>
              <CardTitle>Link expired</CardTitle>
              <CardDescription>
                This reset link has already been used or has expired.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild className="w-full">
                <Link href="/account/forgot-password">Request a new link</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="container py-12">
      <div className="mx-auto max-w-md">
        <Card>
          <CardHeader>
            <CardTitle>Set a new password</CardTitle>
            <CardDescription>
              Choose a strong password with at least 8 characters.
            </CardDescription>
          </CardHeader>
          <form action={resetPasswordAction}>
            <CardContent className="space-y-4">
              <input type="hidden" name="token" value={token ?? ""} />

              {error === "invalid" && (
                <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                  Passwords must match and be at least 8 characters.
                </p>
              )}

              <div className="space-y-2">
                <Label htmlFor="password">New password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm password</Label>
                <Input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                />
              </div>
            </CardContent>
            <CardFooter>
              <Button type="submit" size="lg" className="w-full">
                Set new password
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
