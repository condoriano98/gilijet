import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { dispatchWebhookPayload } from "@/lib/webhook-processor";
import { verifyMayarWebhook } from "@/lib/mayar";
import { normalizePaymentMethod } from "@/lib/psp";

/**
 * Mayar webhook endpoint.
 *
 * Mayar sends a POST with JSON on events like payment.received.
 * Authentication is a shared secret carried in `x-callback-token`
 * (or `Authorization: Bearer`); see `verifyMayarWebhook` in lib/mayar.ts.
 *
 * Webhook payload shape (payment.received):
 *   event: "payment.received"
 *   data.id          — Mayar invoice/transaction ID
 *   data.status      — e.g. "paid"
 *   data.amount      — integer IDR
 *   data.customerName / customerEmail / customerMobile
 *   data.productId / productName
 *
 * We map data.id → our booking via Payment.gatewayReference,
 * then inject external_id = booking.bookingReference so the shared
 * webhook-processor can find and confirm the booking.
 */
export async function POST(req: NextRequest) {
  if (!verifyMayarWebhook(req)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON" },
      { status: 400 },
    );
  }
  if (!payload || typeof payload !== "object") {
    return NextResponse.json(
      { ok: false, error: "Empty payload" },
      { status: 400 },
    );
  }

  const body = payload as Record<string, unknown>;
  const data = (body.data ?? {}) as Record<string, unknown>;

  const rawEvent = String(body.event ?? body.type ?? "").toLowerCase();
  const mayarId = String(data.id ?? body.id ?? "");

  if (!mayarId) {
    return NextResponse.json(
      { ok: false, error: "Missing data.id" },
      { status: 400 },
    );
  }

  // Resolve our booking by the Mayar invoice ID we stored at payment creation.
  let externalRef = "";
  if (rawEvent === "payment.received" || rawEvent === "payment.reminder") {
    const payment = await prisma.payment.findFirst({
      where: { gatewayReference: mayarId, gatewayProvider: "MAYAR" },
      select: { booking: { select: { bookingReference: true } } },
    });
    externalRef = payment?.booking?.bookingReference ?? "";
  } else {
    // For other events (refund.*, etc.) use mayarId as externalRef directly
    externalRef = mayarId;
  }

  // Normalize to the shape dispatchWebhookPayload understands.
  const rawStatus = String(data.status ?? "").toLowerCase();
  let normalizedStatus = "";
  let normalizedEvent = rawEvent;

  if (rawEvent === "payment.received" || rawStatus === "paid" || rawStatus === "success") {
    normalizedStatus = "PAID";
    normalizedEvent = "invoice.paid";
  } else if (rawEvent === "payment.expired" || rawStatus === "expired") {
    normalizedStatus = "EXPIRED";
    normalizedEvent = "invoice.expired";
  } else if (rawEvent === "refund.succeeded") {
    normalizedEvent = "refund.succeeded";
  } else if (rawEvent === "refund.failed") {
    normalizedEvent = "refund.failed";
  }

  const normalized: Record<string, unknown> = {
    external_id: externalRef,
    id: mayarId,
    invoice_id: mayarId,
    status: normalizedStatus,
    event: normalizedEvent,
    paid_at: data.paidAt ?? data.paid_at ?? data.createdAt,
    payment_method: normalizePaymentMethod(String(data.paymentMethod ?? data.payment_method ?? "BANK_TRANSFER")),
    fees_paid_amount: 0,
    _raw: body,
  };

  // Derive eventType for the retry queue
  let eventType = "unknown";
  if (normalizedStatus === "PAID") {
    eventType = "invoice.paid";
  } else if (normalizedStatus === "EXPIRED" || normalizedEvent === "invoice.expired") {
    eventType = "invoice.expired";
  } else if (normalizedEvent === "refund.succeeded") {
    eventType = "refund.succeeded";
  } else if (normalizedEvent === "refund.failed") {
    eventType = "refund.failed";
  }

  // Idempotency: skip if we already PROCESSED this event OR if another
  // worker is mid-flight on it (status PROCESSING). Without the in-flight
  // check, two webhooks arriving within the same processing window both
  // create rows and double-process.
  if (externalRef) {
    const existing = await prisma.webhookEvent.findFirst({
      where: {
        provider: "mayar",
        eventType,
        externalRef,
        status: { in: ["PROCESSED", "PROCESSING"] },
      },
    });
    if (existing) {
      return NextResponse.json({ ok: true, idempotent: true });
    }
  }

  const webhookEvent = await prisma.webhookEvent.create({
    data: {
      provider: "mayar",
      eventType,
      externalRef,
      rawPayload: body as never,
      status: "PROCESSING",
      attempts: 1,
      lastAttemptAt: new Date(),
    },
  });

  try {
    const result = await dispatchWebhookPayload(normalized);

    await prisma.webhookEvent.update({
      where: { id: webhookEvent.id },
      data: {
        status: result.ok ? "PROCESSED" : "FAILED",
        processedAt: result.ok ? new Date() : undefined,
        errorMessage: result.ok ? null : (result as { error: string }).error,
      },
    });

    if (!result.ok && (result as { httpStatus?: number }).httpStatus === 404) {
      return NextResponse.json({ ok: true, ignored: true });
    }
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: (result as { error: string }).error },
        { status: (result as { httpStatus?: number }).httpStatus ?? 500 },
      );
    }
    return NextResponse.json({
      ok: true,
      status: (result as { status: string }).status,
    });
  } catch (err) {
    console.error("[mayar-webhook] handler error:", err);
    await prisma.webhookEvent
      .update({
        where: { id: webhookEvent.id },
        data: {
          status: "FAILED",
          errorMessage: err instanceof Error ? err.message : String(err),
        },
      })
      .catch(() => {});
    return NextResponse.json(
      { ok: false, error: "Handler error" },
      { status: 500 },
    );
  }
}
