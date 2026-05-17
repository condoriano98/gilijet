import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  reserveSeatsAndCreateBooking,
  startPaymentForBooking,
  releaseBookingSeats,
  BookingError,
} from "@/lib/booking-engine";

/**
 * Public POST /api/bookings — accepts an Idempotency-Key header to make
 * retries safe. Mirrors the on-page server action so future mobile or
 * partner clients have a documented surface.
 */

const passengerSchema = z.object({
  name: z.string().min(2).max(120),
  idNumber: z.string().max(40).optional().nullable(),
});

const bodySchema = z.object({
  legId: z.string().min(1),
  customer: z.object({
    name: z.string().min(2).max(120),
    email: z.string().email(),
    phone: z.string().min(6).max(40),
    nationality: z.string().max(80).optional().nullable(),
  }),
  passengers: z.array(passengerSchema).min(1).max(10),
  notes: z.string().max(500).optional().nullable(),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON" },
      { status: 400 },
    );
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const idempotencyKey =
    req.headers.get("idempotency-key") ?? req.headers.get("Idempotency-Key");

  let created: { bookingId: string; bookingReference: string };
  try {
    created = await reserveSeatsAndCreateBooking({
      legId: parsed.data.legId,
      customer: parsed.data.customer,
      passengers: parsed.data.passengers,
      notes: parsed.data.notes ?? null,
      idempotencyKey: idempotencyKey ?? null,
    });
  } catch (err) {
    if (err instanceof BookingError) {
      return NextResponse.json(
        { ok: false, code: err.code, error: err.message },
        { status: err.code === "SOLD_OUT" ? 409 : 400 },
      );
    }
    console.error("[POST /api/bookings] reserve failed:", err);
    return NextResponse.json(
      { ok: false, error: "Internal error" },
      { status: 500 },
    );
  }

  try {
    const result = await startPaymentForBooking(created.bookingId);
    return NextResponse.json({
      ok: true,
      bookingReference: created.bookingReference,
      invoiceUrl: result.invoiceUrl,
      mockPayment: result.mock,
    });
  } catch (err) {
    await releaseBookingSeats(created.bookingId, "payment_failed").catch(
      () => {},
    );
    console.error("[POST /api/bookings] payment init failed:", err);
    return NextResponse.json(
      {
        ok: false,
        error: "Payment setup failed; seats released",
        bookingReference: created.bookingReference,
      },
      { status: 502 },
    );
  }
}
