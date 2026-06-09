import { z } from "zod";
import { prisma } from "./db";
import { env } from "./env";
import { confirmPaymentAndIssueTickets } from "./ticket-issuer";
import { releaseBookingSeats } from "./booking-engine";
import { sendBookingConfirmation } from "./email";
import { normalizePaymentMethod } from "./psp";

// ─── Schemas ─────────────────────────────────────────────────────────────────

export const invoicePaidSchema = z.object({
  external_id: z.string().min(1),
  id: z.string().optional(),
  invoice_id: z.string().optional(),
  status: z.string().optional(),
  paid_at: z.string().optional(),
  payment_method: z.string().optional(),
  fees_paid_amount: z.number().optional(),
});

export const invoiceExpiredSchema = z.object({
  external_id: z.string().min(1),
});

export const refundEventSchema = z.object({
  id: z.string().min(1),
  created: z.string().optional(),
});

// ─── Handlers ────────────────────────────────────────────────────────────────

export type ProcessResult =
  | { ok: true; status: string }
  | { ok: false; error: string; httpStatus?: number };

export async function processInvoicePaid(
  body: Record<string, unknown>,
): Promise<ProcessResult> {
  const parsed = invoicePaidSchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, error: "Invalid invoice.paid payload", httpStatus: 400 };
  }
  const data = parsed.data;
  const invoiceId = data.id ?? data.invoice_id ?? "";

  const booking = await prisma.booking.findUnique({
    where: { bookingReference: data.external_id },
    include: {
      leg: { include: { schedule: { include: { boat: true } } } },
      tickets: true,
      payment: true,
    },
  });
  if (!booking) {
    return { ok: false, error: "Booking not found", httpStatus: 404 };
  }

  const result = await confirmPaymentAndIssueTickets({
    bookingId: booking.id,
    paidAt: data.paid_at ? new Date(data.paid_at) : new Date(),
    method: normalizePaymentMethod(data.payment_method ?? "BANK_TRANSFER"),
    gatewayReference: invoiceId || null,
    gatewayFee: data.fees_paid_amount ?? null,
  });

  if (booking.payment) {
    await prisma.payment.update({
      where: { bookingId: booking.id },
      data: { rawWebhookData: body as never },
    });
  }

  if (!result.alreadyIssued) {
    sendBookingConfirmation({
      to: booking.customerEmail,
      customerName: booking.customerName,
      bookingReference: result.bookingReference,
      route: {
        originPort: booking.leg.schedule.originPort,
        destinationPort: booking.leg.schedule.destinationPort,
      },
      boatName: booking.leg.schedule.boat.name,
      departureDate: booking.leg.departureDate,
      totalAmount: Number(booking.totalAmount),
      lookupUrl: `${env.APP_BASE_URL}/b/${result.bookingReference}`,
      tickets: result.tickets,
    }).catch((err) =>
      console.error("[webhook-processor] email failed:", err),
    );
  }

  return { ok: true, status: "confirmed" };
}

export async function processInvoiceExpired(
  body: Record<string, unknown>,
): Promise<ProcessResult> {
  const parsed = invoiceExpiredSchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, error: "Invalid invoice.expired payload", httpStatus: 400 };
  }
  const booking = await prisma.booking.findUnique({
    where: { bookingReference: parsed.data.external_id },
  });
  if (!booking) return { ok: false, error: "Booking not found", httpStatus: 404 };
  if (booking.status !== "PENDING_PAYMENT") {
    return { ok: true, status: "noop" };
  }

  await prisma.booking.update({
    where: { id: booking.id },
    data: { status: "EXPIRED" },
  });
  await prisma.payment.updateMany({
    where: { bookingId: booking.id, status: "PENDING" },
    data: { status: "EXPIRED" },
  });
  await releaseBookingSeats(booking.id, "expired");
  return { ok: true, status: "expired" };
}

export async function processRefundSucceeded(
  body: Record<string, unknown>,
): Promise<ProcessResult> {
  const parsed = refundEventSchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, error: "Invalid refund payload", httpStatus: 400 };
  }
  const refund = await prisma.refund.findFirst({
    where: { gatewayReference: parsed.data.id },
    include: { booking: true },
  });
  if (!refund) return { ok: true, status: "ignored" };

  await prisma.refund.update({
    where: { id: refund.id },
    data: {
      status: "COMPLETED",
      processedAt: parsed.data.created ? new Date(parsed.data.created) : new Date(),
    },
  });

  // Fire refund-processed email (import inline to avoid circular deps)
  try {
    const { sendRefundProcessedEmail } = await import("./email");
    await sendRefundProcessedEmail({
      to: refund.booking.customerEmail,
      customerName: refund.booking.customerName,
      bookingReference: refund.booking.bookingReference,
      refundAmount: Number(refund.refundAmount),
      lookupUrl: `${env.APP_BASE_URL}/b/${refund.booking.bookingReference}`,
    });
  } catch (err) {
    console.error("[webhook-processor] refund email failed:", err);
  }

  return { ok: true, status: "refund_completed" };
}

export async function processRefundFailed(
  body: Record<string, unknown>,
): Promise<ProcessResult> {
  const parsed = refundEventSchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, error: "Invalid refund payload", httpStatus: 400 };
  }
  const refund = await prisma.refund.findFirst({
    where: { gatewayReference: parsed.data.id },
  });
  if (!refund) return { ok: true, status: "ignored" };
  await prisma.refund.update({
    where: { id: refund.id },
    data: { status: "FAILED" },
  });
  return { ok: true, status: "refund_failed" };
}

/**
 * Routes a raw payload (already auth-verified) to the correct handler.
 * Used both by the webhook route and the retry cron.
 */
export async function dispatchWebhookPayload(
  body: Record<string, unknown>,
): Promise<ProcessResult> {
  const status = String(body.status ?? "").toUpperCase();
  const event = String(body.event ?? "").toLowerCase();

  if (status === "PAID") return processInvoicePaid(body);
  if (status === "EXPIRED" || event === "invoice.expired")
    return processInvoiceExpired(body);
  if (event === "refund.succeeded") return processRefundSucceeded(body);
  if (event === "refund.failed") return processRefundFailed(body);

  return { ok: true, status: "ignored" };
}
