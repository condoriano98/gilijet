import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  getOperatorSession,
  setOperatorSession,
  verifyPassword,
  type OperatorSession,
} from "@/lib/auth";
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
  if (!parsed.success) redirect("/operator/login?error=invalid");

  const operator = await prisma.operator.findUnique({
    where: { email: parsed.data.email.toLowerCase() },
  });
  if (!operator) redirect("/operator/login?error=credentials");

  const ok = await verifyPassword(parsed.data.password, operator.passwordHash);
  if (!ok) redirect("/operator/login?error=credentials");

  if (operator.status !== "ACTIVE") {
    redirect(`/operator/login?error=status_${operator.status.toLowerCase()}`);
  }

  const session: OperatorSession = {
    sub: operator.id,
    role: "operator",
    email: operator.email,
  };
  await setOperatorSession(session);
  redirect("/operator");
}

function errorMessage(code?: string): string | null {
  if (!code) return null;
  if (code === "credentials") return "Invalid email or password.";
  if (code === "status_pending")
    return "Your account is awaiting admin approval. We'll email you when it's ready.";
  if (code === "status_suspended")
    return "Your account is suspended. Contact Gilijet support.";
  if (code === "status_rejected")
    return "Your application was not approved.";
  return "Please check your details.";
}

export default async function OperatorLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const existing = await getOperatorSession();
  if (existing) redirect("/operator");
  const { error } = await searchParams;
  const msg = errorMessage(error);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Operator sign in</CardTitle>
          <CardDescription>
            Boat operators only. Customer booking lookup needs no login.
          </CardDescription>
        </CardHeader>
        <form action={loginAction}>
          <CardContent className="space-y-4">
            {msg ? (
              <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                {msg}
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
