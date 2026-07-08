import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  getAdminSession,
  setAdminSession,
  verifyPassword,
  type AdminSession,
} from "@/lib/auth";
import { loginGate, recordLoginAttempt } from "@/lib/login-throttle";
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

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

async function loginAction(formData: FormData) {
  "use server";

  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) redirect("/admin/login?error=invalid");

  const email = parsed.data.email.toLowerCase();
  const gate = await loginGate("ADMIN", email);
  if (!gate.allowed) redirect("/admin/login?error=locked");

  const admin = await prisma.admin.findUnique({
    where: { email },
  });
  if (!admin) {
    await recordLoginAttempt("ADMIN", email, false);
    redirect("/admin/login?error=credentials");
  }
  const ok = await verifyPassword(parsed.data.password, admin.passwordHash);
  if (!ok) {
    await recordLoginAttempt("ADMIN", email, false);
    redirect("/admin/login?error=credentials");
  }

  await recordLoginAttempt("ADMIN", email, true);
  const session: AdminSession = {
    sub: admin.id,
    role: "admin",
    email: admin.email,
    adminRole: admin.role,
  };
  await setAdminSession(session);
  redirect("/admin");
}

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const existing = await getAdminSession();
  if (existing) redirect("/admin");
  const { error } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Admin sign in</CardTitle>
          <CardDescription>
            Internal Gilibali staff only. Operators sign in{" "}
            <Link href="/operator/login" className="underline">
              here
            </Link>
            .
          </CardDescription>
        </CardHeader>
        <form action={loginAction}>
          <CardContent className="space-y-4">
            {error ? (
              <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                {error === "credentials"
                  ? "Invalid email or password."
                  : error === "locked"
                    ? "Too many failed attempts. Please wait 15 minutes before trying again."
                    : "Please check your details."}
              </p>
            ) : null}
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
                autoComplete="current-password"
              />
            </div>
          </CardContent>
          <CardFooter>
            <Button type="submit" className="w-full">
              Sign in
            </Button>
          </CardFooter>
        </form>
      </Card>
    </main>
  );
}
