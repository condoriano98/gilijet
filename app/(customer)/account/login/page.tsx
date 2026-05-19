import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { verifyPassword, setCustomerSession, getCustomerSession } from "@/lib/auth";
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

export const metadata = { title: "Sign in · Gilijet" };

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

  const customer = await prisma.customer.findUnique({
    where: { email: parsed.data.email.toLowerCase() },
  });
  if (!customer) {
    redirect(`/account/login?error=credentials`);
  }
  const ok = await verifyPassword(parsed.data.password, customer.passwordHash);
  if (!ok) {
    redirect(`/account/login?error=credentials`);
  }

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
            <CardTitle>Sign in to Gilijet</CardTitle>
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
                <Label htmlFor="password">Password</Label>
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
                New to Gilijet?{" "}
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
