import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashPassword, setCustomerSession, getCustomerSession } from "@/lib/auth";
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

export const metadata = { title: "Create account · Gilijet" };

const registerSchema = z.object({
  fullName: z.string().min(2).max(120),
  email: z.string().email(),
  phoneNumber: z.string().min(6).max(40).optional().or(z.literal("")),
  password: z.string().min(8).max(100),
  agreedToTerms: z.string().optional(),
});

async function registerAction(formData: FormData) {
  "use server";
  const parsed = registerSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    phoneNumber: formData.get("phoneNumber"),
    password: formData.get("password"),
    agreedToTerms: formData.get("agreedToTerms"),
  });
  if (!parsed.success) {
    redirect(`/account/register?error=invalid`);
  }
  if (!parsed.data.agreedToTerms) {
    redirect(`/account/register?error=terms`);
  }

  const email = parsed.data.email.toLowerCase();
  const existing = await prisma.customer.findUnique({ where: { email } });
  if (existing) {
    redirect(`/account/register?error=exists`);
  }

  const passwordHash = await hashPassword(parsed.data.password);
  const customer = await prisma.customer.create({
    data: {
      email,
      passwordHash,
      fullName: parsed.data.fullName.trim(),
      phoneNumber: parsed.data.phoneNumber || null,
    },
  });

  await setCustomerSession({
    sub: customer.id,
    role: "customer",
    email: customer.email,
    fullName: customer.fullName,
  });

  const next = (formData.get("next") as string) || "/account";
  redirect(next);
}

export default async function CustomerRegisterPage({
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
            <CardTitle>Create your Gilijet account</CardTitle>
            <CardDescription>
              Save passenger details, see past trips, and skip the form on
              future bookings.
            </CardDescription>
          </CardHeader>
          <form action={registerAction}>
            <CardContent className="space-y-4">
              <input type="hidden" name="next" value={next ?? ""} />

              {error === "exists" && (
                <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  An account with that email already exists.{" "}
                  <Link
                    href={`/account/login${next ? `?next=${encodeURIComponent(next)}` : ""}`}
                    className="underline"
                  >
                    Sign in instead
                  </Link>
                  .
                </p>
              )}
              {error === "terms" && (
                <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                  Please accept the Terms and Privacy Policy.
                </p>
              )}
              {error === "invalid" && (
                <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                  Please fill in all required fields with valid values.
                </p>
              )}

              <GoogleSignInButton next={next || undefined} label="Sign up with Google" />

              <div className="space-y-2">
                <Label htmlFor="fullName">Full name</Label>
                <Input
                  id="fullName"
                  name="fullName"
                  required
                  minLength={2}
                  autoComplete="name"
                />
              </div>
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
                <Label htmlFor="phoneNumber">Phone (WhatsApp)</Label>
                <Input
                  id="phoneNumber"
                  name="phoneNumber"
                  type="tel"
                  placeholder="+62 812 3456 7890"
                  autoComplete="tel"
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
                  autoComplete="new-password"
                />
                <p className="text-xs text-slate-500">At least 8 characters.</p>
              </div>

              <label className="flex items-start gap-2 text-xs text-slate-600">
                <input
                  type="checkbox"
                  name="agreedToTerms"
                  value="1"
                  required
                  className="mt-0.5 h-4 w-4"
                />
                <span>
                  I agree to the{" "}
                  <Link href="/terms" className="text-sky-700 hover:underline">
                    Terms of Service
                  </Link>{" "}
                  and{" "}
                  <Link href="/privacy" className="text-sky-700 hover:underline">
                    Privacy Policy
                  </Link>
                  .
                </span>
              </label>
            </CardContent>
            <CardFooter className="flex-col gap-3">
              <Button type="submit" size="lg" className="w-full">
                Create account
              </Button>
              <div className="text-center text-sm text-slate-600">
                Already have an account?{" "}
                <Link
                  href={`/account/login${next ? `?next=${encodeURIComponent(next)}` : ""}`}
                  className="font-medium text-sky-700 hover:underline"
                >
                  Sign in
                </Link>
              </div>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
