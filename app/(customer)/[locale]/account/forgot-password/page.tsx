import Link from "next/link";
import { redirect } from "next/navigation";
import { randomBytes, createHash } from "crypto";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { sendPasswordResetEmail } from "@/lib/email";
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

export const metadata = { title: "Forgot password · Gilijet" };

async function requestResetAction(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "")
    .toLowerCase()
    .trim();
  if (!email) redirect("/account/forgot-password?error=invalid");

  const customer = await prisma.customer.findUnique({ where: { email } });
  if (customer) {
    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await prisma.passwordResetToken.create({
      data: { email, tokenHash, expiresAt },
    });

    const resetUrl = `${env.APP_BASE_URL}/account/reset-password?token=${rawToken}`;
    await sendPasswordResetEmail({ to: email, resetUrl });
  }

  // Always show success to prevent email enumeration
  redirect("/account/forgot-password?ok=sent");
}

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { ok, error } = await searchParams;

  return (
    <div className="container py-12">
      <div className="mx-auto max-w-md">
        <Card>
          <CardHeader>
            <CardTitle>Forgot your password?</CardTitle>
            <CardDescription>
              Enter your email and we&apos;ll send you a reset link.
            </CardDescription>
          </CardHeader>

          {ok === "sent" ? (
            <CardContent className="space-y-4">
              <div className="rounded-md bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                If an account exists for that email, you&apos;ll receive a
                reset link shortly. Check your inbox (and spam folder).
              </div>
              <Button asChild variant="outline" className="w-full">
                <Link href="/account/login">Back to sign in</Link>
              </Button>
            </CardContent>
          ) : (
            <form action={requestResetAction}>
              <CardContent className="space-y-4">
                {error === "invalid" && (
                  <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                    Please enter a valid email address.
                  </p>
                )}
                <div className="space-y-2">
                  <Label htmlFor="email">Email address</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="you@example.com"
                  />
                </div>
              </CardContent>
              <CardFooter className="flex-col gap-3">
                <Button type="submit" size="lg" className="w-full">
                  Send reset link
                </Button>
                <div className="text-center text-sm text-slate-600">
                  Remember it?{" "}
                  <Link
                    href="/account/login"
                    className="font-medium text-sky-700 hover:underline"
                  >
                    Sign in
                  </Link>
                </div>
              </CardFooter>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}
