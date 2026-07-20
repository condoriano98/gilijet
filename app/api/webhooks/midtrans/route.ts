import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { dispatchWebhookPayload } from "@/lib/webhook-processor";
import { verifyMidtransWebhook } from "@/lib/midtrans";
import { normalizePaymentMethod } from "@/lib/psp";

/**
 * Midtrans HTTP notification endpoint.
 *
 * Midtrans POSTs a JSON body on payment events.  We verify the
 * `signature_key` field via SHA-512 comparison, map `order_id` →
 * our booking reference, normalise the payload shape, and hand it
 * to the shared webhook processor.
 *
 * Notification path: /api/webhooks/midtrans
 */

function midtransStatusToNormalized(
  txnStatus: string,
): { status: string; event: string } | null {
  switch (txnStatus.toLowerCase()) {
    case "settlement":
    case "capture":
      return { status: "PAID", event: "invoice.paid" };
    case "expire":
    case "deny":
    case "cancel":
      return { status: "EXPIRED", event: "invoice.expired" };
    case "failure":
      // A failed attempt isn't terminal — the hold timer still runs.
      // Return null to signal "ignore this webhook".
      return null;
    case "pending":
      // Customer started but hasn't completed — don't act yet.
      return null;
    default:
      return null;
  }
}

export async function POST(req: NextRequest) {
  let payload: Record<string, unknown>;
  try {
    payload = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON" },
      { status: 400 },
    );
  }

  if (!verifyMidtransWebhook(payload)) {
    return NextResponse.json(
      { ok: false, error: "Invalid signature" },
      { status: 401 },
    );
  }

  const orderId = String(payload.order_id ?? "");
  if (!orderId) {
    return NextResponse.json(
      { ok: false, error: "Missing order_id" },
      { status: 400 },
    );
  }

  const txnStatus = String(payload.transaction_status ?? "");
  const paymentType = String(payload.payment_type ?? "bank_transfer");
  const grossAmount = String(payload.gross_amount ?? "0");

  const mapped = midtransStatusToNormalized(txnStatus);
  if (!mapped) {
    // pending / failure — ack silently
    return NextResponse.json({ ok: true, ignored: true });
  }

  let method = "BANK_TRANSFER";
  try {
    method = normalizePaymentMethod(paymentType);
  } catch {
    method = "BANK_TRANSFER";
  }

  const normalized: Record<string, unknown> = {
    external_id: orderId,
    id: String(payload.transaction_id ?? ""),
    invoice_id: orderId,
    status: mapped.status,
    event: mapped.event,
    paid_at: String(payload.settlement_time ?? payload.transaction_time ?? ""),
    payment_method: method,
    fees_paid_amount: 0,
    gross_amount: grossAmount,
    _raw: payload,
  };

  const eventType = mapped.event;

  // Idempotency: skip if already processed or in-flight.
  const existing = await prisma.webhookEvent.findFirst({
    where: {
      provider: "midtrans",
      eventType,
      externalRef: orderId,
      status: { in: ["PROCESSED", "PROCESSING"] },
    },
  });
  if (existing) {
    return NextResponse.json({ ok: true, idempotent: true });
  }

  const webhookEvent = await prisma.webhookEvent.create({
    data: {
      provider: "midtrans",
      eventType,
      externalRef: orderId,
      rawPayload: payload as never,
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
    return NextResponse.json({ ok: true, status: (result as { status: string }).status });
  } catch (err) {
    console.error("[midtrans-webhook] handler error:", err);
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
