import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  reserveSeatsAndCreateBooking,
  startPaymentForBooking,
  releaseBookingSeats,
  BookingError,
} from "@/lib/booking-engine";
import { expireStalePendingBookings } from "@/lib/booking-expiry";
import { formatLocalDate, formatLocalTime } from "@/lib/datetime";
import { formatIDR } from "@/lib/utils";
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
import { Textarea } from "@/components/ui/textarea";
import { PassengerFields } from "@/components/customer/passenger-fields";
import { PromoCodeInput } from "@/components/customer/promo-code-input";
import { BookingProgress } from "@/components/customer/booking-progress";
import { SubmitBookingButton } from "@/components/customer/submit-booking-button";
import { getCustomerSession } from "@/lib/auth";
import type { PassengerType } from "@/lib/pricing";

const NAMES_MIN = 2;
const PHONE_MIN = 6;

function clampPassengerCount(raw: FormDataEntryValue[]): string[] {
  const arr = raw.map((v) => String(v).trim()).filter(Boolean);
  return arr.slice(0, 10);
}

const bookingFormSchema = z.object({
  customerName: z.string().min(NAMES_MIN).max(120),
  customerEmail: z.string().email(),
  customerPhone: z.string().min(PHONE_MIN).max(40),
  customerNationality: z.string().max(80).optional().or(z.literal("")),
  notes: z.string().max(500).optional().or(z.literal("")),
  agreedToTerms: z.string().optional(),
});

async function submitBookingAction(formData: FormData) {
  "use server";

  const legId = String(formData.get("legId") ?? "");
  if (!legId) redirect("/");

  const passengerNames = clampPassengerCount(formData.getAll("passengerName"));
  const passengerIds = formData.getAll("passengerIdNumber").map((v) => String(v).trim());
  const passengerTypesRaw = formData.getAll("passengerType").map((v) => String(v).trim());
  const passengerTypes: PassengerType[] = passengerNames.map((_, idx) => {
    const t = passengerTypesRaw[idx];
    return t === "CHILD" || t === "INFANT" ? t : "ADULT";
  });
  const promoCode = String(formData.get("promoCode") ?? "").trim() || null;

  if (passengerNames.length === 0 || passengerNames.some((n) => n.length < NAMES_MIN)) {
    redirect(
      `/book/${legId}?error=${encodeURIComponent("Each passenger needs a name")}`,
    );
  }

  const fields = bookingFormSchema.safeParse({
    customerName: formData.get("customerName"),
    customerEmail: formData.get("customerEmail"),
    customerPhone: formData.get("customerPhone"),
    customerNationality: formData.get("customerNationality"),
    notes: formData.get("notes"),
    agreedToTerms: formData.get("agreedToTerms"),
  });
  if (!fields.success) {
    redirect(
      `/book/${legId}?error=${encodeURIComponent(fields.error.issues[0].message)}`,
    );
  }
  if (!fields.data.agreedToTerms) {
    redirect(
      `/book/${legId}?error=${encodeURIComponent("Please accept the terms")}`,
    );
  }

  // If the user is signed in, link the booking to their account.
  const session = await getCustomerSession();

  let created: { bookingId: string; bookingReference: string };
  try {
    created = await reserveSeatsAndCreateBooking({
      legId,
      customer: {
        name: fields.data.customerName.trim(),
        email: fields.data.customerEmail.trim(),
        phone: fields.data.customerPhone.trim(),
        nationality: fields.data.customerNationality || null,
      },
      passengers: passengerNames.map((name, idx) => ({
        name,
        idNumber: passengerIds[idx] || null,
        type: passengerTypes[idx],
      })),
      notes: fields.data.notes || null,
      customerId: session?.sub ?? null,
      promoCode,
    });
  } catch (err) {
    if (err instanceof BookingError) {
      redirect(`/book/${legId}?error=${encodeURIComponent(err.message)}`);
    }
    throw err;
  }

  let payment: { invoiceUrl: string | null; mock: boolean };
  try {
    payment = await startPaymentForBooking(created.bookingId);
  } catch (err) {
    // Roll back the reservation so seats aren't held forever.
    await releaseBookingSeats(created.bookingId, "payment_failed").catch(
      () => {},
    );
    await prisma.booking
      .update({
        where: { id: created.bookingId },
        data: { status: "EXPIRED" },
      })
      .catch(() => {});
    const message = err instanceof Error ? err.message : "Payment setup failed";
    redirect(`/book/${legId}?error=${encodeURIComponent(message)}`);
  }

  if (payment.invoiceUrl) {
    redirect(payment.invoiceUrl);
  }
  if (payment.mock) {
    redirect(`/checkout/${created.bookingReference}`);
  }
  redirect(`/pay/${created.bookingReference}`);
}

export default async function BookPage({
  params,
  searchParams,
}: {
  params: Promise<{ legId: string }>;
  searchParams: Promise<{ passengers?: string; error?: string }>;
}) {
  const { legId } = await params;
  const { passengers: passengersRaw, error } = await searchParams;
  const initialPassengers = Math.max(
    1,
    Math.min(10, Number(passengersRaw ?? 1) || 1),
  );

  const [leg, session] = await Promise.all([
    prisma.leg.findUnique({
      where: { id: legId },
      include: {
        schedule: { include: { boat: true } },
      },
    }),
    getCustomerSession(),
  ]);
  if (!leg) notFound();

  // If logged in, pull the customer record for prefill.
  const customer = session
    ? await prisma.customer.findUnique({ where: { id: session.sub } })
    : null;

  if (leg.status !== "OPEN" || leg.departureDate.getTime() <= Date.now()) {
    return (
      <div className="container py-12">
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            This departure is no longer accepting bookings.
            <div className="mt-3">
              <Button asChild>
                <Link href="/">Search another</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const unitPrice = Number(leg.basePrice);

  return (
    <div className="container py-8">
      <div className="mx-auto max-w-3xl">
        <BookingProgress currentStep={2} />
        <Link
          href={`/search?origin=${encodeURIComponent(leg.schedule.originPort)}&destination=${encodeURIComponent(leg.schedule.destinationPort)}`}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Back to search
        </Link>

        <Card className="mt-3">
          <CardHeader>
            <CardTitle className="text-2xl">
              {leg.schedule.originPort} → {leg.schedule.destinationPort}
            </CardTitle>
            <CardDescription>
              {formatLocalDate(leg.departureDate, "EEEE, dd MMM yyyy")} ·{" "}
              <span className="font-mono">
                {formatLocalTime(leg.departureDate)}
              </span>{" "}
              WITA · {leg.schedule.boat.name}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <div>
              <span className="text-muted-foreground">Per passenger:</span>{" "}
              <span className="font-semibold">{formatIDR(unitPrice)}</span>
            </div>
            <div className="text-muted-foreground">
              {leg.availableSeats} seats remaining
            </div>
          </CardContent>
        </Card>

        <form action={submitBookingAction} className="mt-6 space-y-6">
          <input type="hidden" name="legId" value={leg.id} />

          {error ? (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}

          {customer ? (
            <p className="rounded-md bg-sky-50 px-3 py-2 text-xs text-sky-900">
              Booking as <strong>{customer.fullName}</strong> ({customer.email}).
              This trip will appear in your{" "}
              <Link href="/account" className="underline">account</Link>.
            </p>
          ) : (
            <p className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-700">
              Booking as a guest.{" "}
              <Link
                href={`/account/login?next=${encodeURIComponent(`/book/${leg.id}?passengers=${initialPassengers}`)}`}
                className="font-medium text-sky-700 hover:underline"
              >
                Sign in
              </Link>{" "}
              or{" "}
              <Link
                href={`/account/register?next=${encodeURIComponent(`/book/${leg.id}?passengers=${initialPassengers}`)}`}
                className="font-medium text-sky-700 hover:underline"
              >
                create an account
              </Link>{" "}
              to save this trip and skip the form next time.
            </p>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Passengers</CardTitle>
              <CardDescription>
                Up to 10 per booking. Names should match a government ID where
                possible.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PassengerFields initialCount={initialPassengers} max={10} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Contact details</CardTitle>
              <CardDescription>
                We send your tickets and any updates here.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="customerName">Your name</Label>
                <Input
                  id="customerName"
                  name="customerName"
                  required
                  minLength={NAMES_MIN}
                  autoComplete="name"
                  defaultValue={customer?.fullName ?? ""}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="customerEmail">Email</Label>
                  <Input
                    id="customerEmail"
                    name="customerEmail"
                    type="email"
                    required
                    autoComplete="email"
                    defaultValue={customer?.email ?? ""}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="customerPhone">
                    Phone (WhatsApp preferred)
                  </Label>
                  <Input
                    id="customerPhone"
                    name="customerPhone"
                    type="tel"
                    required
                    minLength={PHONE_MIN}
                    autoComplete="tel"
                    defaultValue={customer?.phoneNumber ?? ""}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="customerNationality">
                  Nationality (optional)
                </Label>
                <Input
                  id="customerNationality"
                  name="customerNationality"
                  placeholder="e.g. Indonesia"
                  defaultValue={customer?.nationality ?? ""}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Notes (optional)</Label>
                <Textarea
                  id="notes"
                  name="notes"
                  rows={2}
                  placeholder="Anything the operator should know"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Promo code</CardTitle>
              <CardDescription>
                Have a discount code? Apply it here.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PromoCodeInput baseAmount={unitPrice * initialPassengers} />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 pt-6">
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  name="agreedToTerms"
                  value="1"
                  required
                  className="mt-0.5 h-4 w-4"
                />
                <span>
                  I agree to the refund policy: more than 7 days before
                  departure, 100% refund · 48 hours–7 days, 50% · less than 48
                  hours, no refund. Operator cancellations are always 100%
                  refunded.
                </span>
              </label>
            </CardContent>
            <CardFooter>
              <SubmitBookingButton amount={unitPrice * initialPassengers} />
            </CardFooter>
          </Card>
        </form>
      </div>
    </div>
  );
}
