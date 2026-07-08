import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { verifyPassword, setCustomerSession, getCustomerSession } from "@/lib/auth";
import { loginGate, recordLoginAttempt } from "@/lib/login-throttle";
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
import { GoogleSignInButton } from "@/components/customer/google-signin-button";

export const metadata = { title: "Sign in · Gilibali" };

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

async function loginAction(formData: FormData) {
  "use server";
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    redirect(`/account/login?error=invalid`);
  }

  const email = parsed.data.email.toLowerCase();
  const gate = await loginGate("CUSTOMER", email);
  if (!gate.allowed) {
    redirect(`/account/login?error=locked`);
  }

  const customer = await prisma.customer.findUnique({
    where: { email },
  });
  if (!customer || !customer.passwordHash) {
    // No passwordHash means a Google-only account. Don't reveal which case
    // it is; surface the same generic credentials error.
    await recordLoginAttempt("CUSTOMER", email, false);
    redirect(`/account/login?error=credentials`);
  }
  const ok = await verifyPassword(parsed.data.password, customer.passwordHash);
  if (!ok) {
    await recordLoginAttempt("CUSTOMER", email, false);
    redirect(`/account/login?error=credentials`);
  }

  await recordLoginAttempt("CUSTOMER", email, true);
  await setCustomerSession({
    sub: customer.id,
    role: "customer",
    email: customer.email,
    fullName: customer.fullName,
  });

  const next = (formData.get("next") as string) || "/account";
  redirect(next);
}

export default async function CustomerLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const session = await getCustomerSession();
  if (session) redirect("/account");
  const { error, next } = await searchParams;

  return (
    <div className="container py-12">
      <div className="mx-auto max-w-md">
        <Card>
          <CardHeader>
            <CardTitle>Sign in to Gilibali</CardTitle>
            <CardDescription>
              Manage bookings, see ticket history, and check in faster.
            </CardDescription>
          </CardHeader>
          <form action={loginAction}>
            <CardContent className="space-y-4">
              <input type="hidden" name="next" value={next ?? ""} />

              {error === "credentials" && (
                <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                  Wrong email or password.
                </p>
              )}
              {error === "invalid" && (
                <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                  Check your email and password.
                </p>
              )}
              {error === "locked" && (
                <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                  Too many failed attempts. Please wait 15 minutes before trying again.
                </p>
              )}
              {error === "google_unavailable" && (
                <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  Google sign-in is currently unavailable. Use email and password instead.
                </p>
              )}
              {error === "google_cancelled" && (
                <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  Google sign-in was cancelled.
                </p>
              )}
              {error === "google_state" && (
                <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                  Google sign-in could not be verified. Please try again.
                </p>
              )}
              {error === "google_exchange" && (
                <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                  We couldn&apos;t complete sign-in with Google. Please try again.
                </p>
              )}
              {error === "google_unverified" && (
                <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                  Your Google email isn&apos;t verified. Please verify it in Google and try again.
                </p>
              )}

              <GoogleSignInButton next={next || undefined} />

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  <Link
                    href="/account/forgot-password"
                    className="text-xs text-sky-700 hover:underline"
                  >
                    Forgot password?
                  </Link>
                </div>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="current-password"
                />
              </div>
            </CardContent>
            <CardFooter className="flex-col gap-3">
              <Button type="submit" size="lg" className="w-full">
                Sign in
              </Button>
              <div className="text-center text-sm text-slate-600">
                New to Gilibali?{" "}
                <Link
                  href={`/account/register${next ? `?next=${encodeURIComponent(next)}` : ""}`}
                  className="font-medium text-sky-700 hover:underline"
                >
                  Create an account
                </Link>
              </div>
              <div className="text-center text-xs text-slate-500">
                Just need a ticket?{" "}
                <Link href="/b" className="text-sky-700 hover:underline">
                  Look up your booking
                </Link>
              </div>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
