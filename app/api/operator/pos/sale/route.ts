import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getOperatorSession } from "@/lib/auth";
import { reserveSeatsAndCreateBooking } from "@/lib/booking-engine";

const saleSchema = z.object({
  legId: z.string(),
  adults: z.number().int().min(0),
  children: z.number().int().min(0),
  infants: z.number().int().min(0),
  paymentMethod: z.enum(["CASH", "QRIS"]),
  amountReceived: z.number().nonnegative().optional(),
  customerName: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const session = await getOperatorSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = saleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid input" }, { status: 400 });
  }

  const { legId, adults, children, infants, paymentMethod, amountReceived, customerName } = parsed.data;
  const totalPassengers = adults + children + infants;
  if (totalPassengers < 1) {
    return NextResponse.json({ ok: false, error: "At least one passenger required" }, { status: 400 });
  }

  const passengers = [
    ...Array.from({ length: adults }, (_, i) => ({ name: `Adult ${i + 1}`, type: "ADULT" as const })),
    ...Array.from({ length: children }, (_, i) => ({ name: `Child ${i + 1}`, type: "CHILD" as const })),
    ...Array.from({ length: infants }, (_, i) => ({ name: `Infant ${i + 1}`, type: "INFANT" as const })),
  ];

  try {
    const result = await reserveSeatsAndCreateBooking({
      legId,
      customer: {
        name: customerName ?? "Walk-in Customer",
        email: `walkin+${Date.now()}@gilifast.internal`,
        phone: "-",
      },
      passengers,
      salesChannel: "WALK_IN",
    });

    if (paymentMethod === "CASH") {
      await prisma.$transaction(async (tx) => {
        const booking = await tx.booking.findUnique({ where: { id: result.bookingId } });
        await tx.booking.update({
          where: { id: result.bookingId },
          data: {
            status: "CONFIRMED",
            cashCollected: amountReceived ?? (booking?.totalAmount ?? 0),
          },
        });
        await tx.payment.updateMany({
          where: { bookingId: result.bookingId },
          data: { status: "SUCCESSFUL", method: "BANK_TRANSFER", paidAt: new Date() },
        });
      });
    }

    return NextResponse.json({
      ok: true,
      bookingId: result.bookingId,
      bookingReference: result.bookingReference,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sale failed";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

export const dynamic = "force-dynamic";
