import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth";
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
import { formatIDR } from "@/lib/utils";
import { cookies } from "next/headers";
import { SignJWT } from "jose";

export const metadata = { title: "Agent Login · Gilijet" };

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

async function loginAction(formData: FormData) {
  "use server";
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    redirect("/agent/login?error=invalid_credentials");
  }

  const agent = await prisma.agent.findUnique({
    where: { email: parsed.data.email },
  });
  if (!agent || agent.status !== "ACTIVE") {
    redirect("/agent/login?error=invalid_credentials");
  }

  const valid = await verifyPassword(parsed.data.password, agent.passwordHash);
  if (!valid) {
    redirect("/agent/login?error=invalid_credentials");
  }

  const secret = new TextEncoder().encode(process.env.AUTH_SECRET || "fallback-secret");
  const token = await new SignJWT({
    sub: agent.id,
    role: "agent",
    email: agent.email,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("24h")
    .sign(secret);

  const cookieStore = await cookies();
  cookieStore.set("gilijet_agent", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24,
  });

  redirect("/agent");
}

export default async function AgentLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold tracking-tight">Agent Portal</h1>
          <p className="text-sm text-slate-600">Sign in to your agent account</p>
        </div>
        <Card>
          <CardContent className="pt-6">
            {error ? (
              <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                Invalid email or password
              </p>
            ) : null}
            <form action={loginAction} className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  required
                  autoComplete="current-password"
                />
              </div>
              <Button type="submit" className="w-full">
                Sign in
              </Button>
            </form>
            <div className="mt-4 text-center text-xs text-slate-600">
              Need an agent account?{" "}
              <Link href="/contact" className="text-sky-700 hover:underline">
                Contact us
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
