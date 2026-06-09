import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyApiKey } from "@/lib/agent-auth";
import { reserveSeatsAndCreateBooking, startPaymentForBooking } from "@/lib/booking-engine";
import { z } from "zod";

const createBookingSchema = z.object({
  legId: z.string(),
  customerName: z.string().min(2),
  customerEmail: z.string().email(),
  customerPhone: z.string().min(6),
  customerNationality: z.string().optional(),
  passengers: z.array(
    z.object({
      name: z.string().min(2),
      idNumber: z.string().optional(),
      type: z.enum(["ADULT", "CHILD", "INFANT"]).default("ADULT"),
    }),
  ).min(1).max(10),
  notes: z.string().optional(),
});

async function authenticateAgent(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const apiKey = authHeader.slice(7);

  const agents = await prisma.agent.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, apiKeyHash: true, commissionRate: true },
  });

  for (const agent of agents) {
    if (verifyApiKey(apiKey, agent.apiKeyHash)) {
      return { id: agent.id, commissionRate: agent.commissionRate };
    }
  }
  return null;
}

export async function POST(req: NextRequest) {
  const agent = await authenticateAgent(req);
  if (!agent) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = createBookingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  try {
    const created = await reserveSeatsAndCreateBooking({
      legId: parsed.data.legId,
      customer: {
        name: parsed.data.customerName,
        email: parsed.data.customerEmail,
        phone: parsed.data.customerPhone,
        nationality: parsed.data.customerNationality ?? null,
      },
      passengers: parsed.data.passengers,
      notes: parsed.data.notes ?? null,
      customerId: null,
      promoCode: null,
      agentId: agent.id,
    });

    const payment = await startPaymentForBooking(created.bookingId);

    return NextResponse.json(
      {
        bookingReference: created.bookingReference,
        paymentUrl: payment.invoiceUrl,
        status: "pending_payment",
      },
      { status: 201 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Booking failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function GET(req: NextRequest) {
  const agent = await authenticateAgent(req);
  if (!agent) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const bookings = await prisma.booking.findMany({
    where: { agentId: agent.id },
    include: {
      leg: { include: { schedule: true } },
      payment: true,
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json({ bookings });
}
