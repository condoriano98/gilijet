import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  requireCustomer,
  clearCustomerSession,
  hashPassword,
  verifyPassword,
} from "@/lib/auth";
import { formatLocalDate, formatLocalTime } from "@/lib/datetime";
import { formatIDR } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const metadata = { title: "My account · Gilibali" };

async function logoutAction() {
  "use server";
  await clearCustomerSession();
  redirect("/");
}

const profileSchema = z.object({
  fullName: z.string().min(2).max(120),
  phoneNumber: z.string().max(40).optional().or(z.literal("")),
  nationality: z.string().max(80).optional().or(z.literal("")),
});

async function updateProfileAction(formData: FormData) {
  "use server";
  const session = await requireCustomer();
  const parsed = profileSchema.safeParse({
    fullName: formData.get("fullName"),
    phoneNumber: formData.get("phoneNumber"),
    nationality: formData.get("nationality"),
  });
  if (!parsed.success) {
    redirect(`/account?error=${encodeURIComponent(parsed.error.issues[0].message)}`);
  }
  await prisma.customer.update({
    where: { id: session.sub },
    data: {
      fullName: parsed.data.fullName.trim(),
      phoneNumber: parsed.data.phoneNumber?.trim() || null,
      nationality: parsed.data.nationality?.trim() || null,
    },
  });
  redirect("/account?ok=profile_updated");
}

const passwordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(120),
});

async function changePasswordAction(formData: FormData) {
  "use server";
  const session = await requireCustomer();
  const parsed = passwordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
  });
  if (!parsed.success) {
    redirect("/account?error=password_invalid");
  }
  const customer = await prisma.customer.findUnique({
    where: { id: session.sub },
  });
  if (!customer) redirect("/account/login");
  // Google-only accounts have no passwordHash yet. Send them to
  // forgot-password to mint one via the verified email flow.
  if (!customer.passwordHash) redirect("/account?error=no_password_set");
  const ok = await verifyPassword(parsed.data.currentPassword, customer.passwordHash);
  if (!ok) redirect("/account?error=wrong_password");
  const newHash = await hashPassword(parsed.data.newPassword);
  await prisma.customer.update({
    where: { id: session.sub },
    data: { passwordHash: newHash },
  });
  redirect("/account?ok=password_changed");
}

function statusVariant(status: string) {
  switch (status) {
    case "CONFIRMED":
      return "success" as const;
    case "PENDING_PAYMENT":
      return "warning" as const;
    case "EXPIRED":
    case "CANCELLED_BY_CUSTOMER":
    case "CANCELLED_BY_OPERATOR":
      return "destructive" as const;
    default:
      return "outline" as const;
  }
}

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const { error, ok } = await searchParams;
  const session = await requireCustomer();

  const customer = await prisma.customer.findUnique({
    where: { id: session.sub },
  });
  if (!customer) {
    await clearCustomerSession();
    redirect("/account/login");
  }

  // Pull bookings linked by customerId OR matching the customer's email
  // (covers bookings made before the user registered).
  const bookings = await prisma.booking.findMany({
    where: {
      OR: [
        { customerId: session.sub },
        { customerEmail: session.email },
      ],
    },
    include: {
      leg: { include: { schedule: { include: { boat: true } } } },
      review: true,
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const now = Date.now();
  const REVIEW_WINDOW_MS = 2 * 60 * 60 * 1000;
  const upcoming = bookings.filter(
    (b) => b.status === "CONFIRMED" && b.leg.departureDate.getTime() > now,
  );
  const past = bookings.filter((b) => !upcoming.includes(b));

  return (
    <div className="container py-10">
      <div className="mx-auto max-w-4xl">
        {/* Profile header */}
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Hi, {customer.fullName.split(" ")[0]}
            </h1>
            <p className="text-sm text-slate-600">{customer.email}</p>
          </div>
          <form action={logoutAction}>
            <Button type="submit" variant="outline" size="sm">
              Sign out
            </Button>
          </form>
        </div>

        {ok ? (
          <p className="mb-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {ok.replace(/_/g, " ")} ✓
          </p>
        ) : null}
        {error ? (
          <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error.replace(/_/g, " ")}
          </p>
        ) : null}

        {/* Quick stats */}
        <div className="mb-8 grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Upcoming trips</CardDescription>
              <CardTitle className="text-3xl">{upcoming.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total bookings</CardDescription>
              <CardTitle className="text-3xl">{bookings.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Quick action</CardDescription>
              <CardContent className="px-0 pt-2 pb-0">
                <Button asChild size="sm" className="w-full">
                  <Link href="/">Book a new trip</Link>
                </Button>
              </CardContent>
            </CardHeader>
          </Card>
        </div>

        {/* Upcoming */}
        <h2 className="mb-3 text-lg font-bold tracking-tight">Upcoming trips</h2>
        {upcoming.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-slate-600">
              No upcoming trips. <Link href="/" className="text-sky-700 hover:underline">Find a boat →</Link>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {upcoming.map((b) => (
              <BookingCard key={b.id} booking={b} />
            ))}
          </div>
        )}

        {/* History */}
        {past.length > 0 && (
          <>
            <h2 className="mt-10 mb-3 text-lg font-bold tracking-tight">
              Booking history
            </h2>
            <div className="space-y-3">
              {past.map((b) => {
                const canReview =
                  b.status === "CONFIRMED" &&
                  !b.review &&
                  b.leg.departureDate.getTime() < now - REVIEW_WINDOW_MS;
                return (
                  <BookingCard
                    key={b.id}
                    booking={b}
                    canReview={canReview}
                    hasReview={!!b.review}
                    muted
                  />
                );
              })}
            </div>
          </>
        )}

        {/* Profile editing */}
        <h2 className="mt-10 mb-3 text-lg font-bold tracking-tight">Profile</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Personal details</CardTitle>
              <CardDescription>Used to prefill new bookings.</CardDescription>
            </CardHeader>
            <form action={updateProfileAction}>
              <CardContent className="space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="fullName">Full name</Label>
                  <Input
                    id="fullName"
                    name="fullName"
                    defaultValue={customer.fullName}
                    required
                    minLength={2}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="phoneNumber">Phone (WhatsApp preferred)</Label>
                  <Input
                    id="phoneNumber"
                    name="phoneNumber"
                    type="tel"
                    defaultValue={customer.phoneNumber ?? ""}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="nationality">Nationality</Label>
                  <Input
                    id="nationality"
                    name="nationality"
                    defaultValue={customer.nationality ?? ""}
                  />
                </div>
                <Button type="submit" size="sm">
                  Save changes
                </Button>
              </CardContent>
            </form>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Change password</CardTitle>
              <CardDescription>
                You&apos;ll stay signed in on this device.
              </CardDescription>
            </CardHeader>
            {customer.passwordHash ? (
              <form action={changePasswordAction}>
                <CardContent className="space-y-3">
                  <div className="space-y-1">
                    <Label htmlFor="currentPassword">Current password</Label>
                    <Input
                      id="currentPassword"
                      name="currentPassword"
                      type="password"
                      required
                      autoComplete="current-password"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="newPassword">New password</Label>
                    <Input
                      id="newPassword"
                      name="newPassword"
                      type="password"
                      required
                      minLength={8}
                      autoComplete="new-password"
                    />
                  </div>
                  <Button type="submit" size="sm" variant="outline">
                    Update password
                  </Button>
                </CardContent>
              </form>
            ) : (
              <CardContent className="text-sm text-slate-600">
                Your account uses Google sign-in. To set a password,{" "}
                <Link href="/account/forgot-password" className="text-sky-700 hover:underline">
                  use the forgot-password flow
                </Link>
                .
              </CardContent>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

type BookingWithLeg = {
  id: string;
  bookingReference: string;
  status: string;
  totalAmount: unknown;
  leg: {
    departureDate: Date;
    schedule: {
      originPort: string;
      destinationPort: string;
      boat: { name: string };
    };
  };
};

function BookingCard({
  booking,
  muted,
  canReview,
  hasReview,
}: {
  booking: BookingWithLeg;
  muted?: boolean;
  canReview?: boolean;
  hasReview?: boolean;
}) {
  return (
    <Card className={muted ? "opacity-90" : ""}>
      <CardContent className="flex flex-wrap items-start justify-between gap-4 p-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-900">
              {booking.leg.schedule.originPort} →{" "}
              {booking.leg.schedule.destinationPort}
            </span>
            <Badge variant={statusVariant(booking.status)} className="text-xs">
              {booking.status.replace(/_/g, " ")}
            </Badge>
            {hasReview ? (
              <Badge variant="outline" className="text-xs">
                Reviewed
              </Badge>
            ) : null}
          </div>
          <div className="mt-1 text-sm text-slate-600">
            {formatLocalDate(booking.leg.departureDate, "EEE, dd MMM yyyy")}{" "}
            ·{" "}
            <span className="font-mono">
              {formatLocalTime(booking.leg.departureDate)}
            </span>{" "}
            WITA · {booking.leg.schedule.boat.name}
          </div>
          <div className="mt-1 font-mono text-xs text-slate-500">
            {booking.bookingReference}
          </div>
          {canReview ? (
            <Link
              href={`/reviews/new?bookingId=${booking.id}`}
              className="mt-2 inline-block text-sm font-medium text-amber-700 hover:underline"
            >
              ★ Rate your trip →
            </Link>
          ) : null}
        </div>
        <div className="text-right">
          <div className="font-semibold">
            {formatIDR(Number(booking.totalAmount))}
          </div>
          <Button asChild size="sm" variant="outline" className="mt-2">
            <Link href={`/b/${booking.bookingReference}`}>View</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
