import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyWebhookSignature } from "@/lib/mayar";
import { dispatchWebhookPayload } from "@/lib/webhook-processor";

/**
 * Mayar webhook endpoint.
 * 1. Verify HMAC signature (or token-style fallback)
 * 2. Normalize Mayar's payload → generic webhook shape
 * 3. Persist raw payload as WebhookEvent (enables retry on failure)
 * 4. Dispatch through the shared processor
 * 5. Mark event PROCESSED or FAILED
 *
 * Mayar event names we care about (verify in dashboard → Webhooks):
 *   payment.received / invoice.paid    → status: PAID
 *   payment.expired / invoice.expired  → status: EXPIRED
 *   refund.succeeded                   → refund completed
 *   refund.failed                      → refund failed
 */

function normalizeMayarPayload(
  body: Record<string, unknown>,
): Record<string, unknown> {
  const data = (body.data ?? {}) as Record<string, unknown>;

  const rawEvent = String(body.event ?? body.type ?? "").toLowerCase();
  const rawStatus = String(
    body.status ?? data.status ?? "",
  ).toUpperCase();

  // Mayar bookingReference is stored in our `email` field (or referenceId)
  // depending on tenant config. Check the common spots.
  const externalRef =
    data.referenceId ??
    data.reference_id ??
    body.referenceId ??
    body.reference_id ??
    data.externalId ??
    body.externalId ??
    data.email ??
    "";

  const invoiceId =
    data.id ?? data.transaction_id ?? data.transactionId ?? body.id ?? "";

  // Map Mayar status/event → the values dispatchWebhookPayload expects
  let normalizedStatus = rawStatus;
  let normalizedEvent = rawEvent;
  if (
    rawStatus === "SUCCESS" ||
    rawStatus === "PAID" ||
    rawEvent === "payment.received" ||
    rawEvent === "invoice.paid"
  ) {
    normalizedStatus = "PAID";
  } else if (
    rawStatus === "EXPIRED" ||
    rawEvent === "payment.expired" ||
    rawEvent === "invoice.expired"
  ) {
    normalizedStatus = "EXPIRED";
    normalizedEvent = "invoice.expired";
  } else if (rawEvent === "refund.succeeded") {
    normalizedEvent = "refund.succeeded";
  } else if (rawEvent === "refund.failed") {
    normalizedEvent = "refund.failed";
  }

  return {
    external_id: String(externalRef),
    id: String(invoiceId),
    invoice_id: String(invoiceId),
    status: normalizedStatus,
    event: normalizedEvent,
    paid_at: data.paidAt ?? data.paid_at ?? body.paidAt ?? body.paid_at,
    payment_method:
      data.paymentMethod ?? data.payment_method ?? body.paymentMethod ?? "mayar",
    fees_paid_amount: data.fee ?? body.fee ?? 0,
    _raw: body,
  };
}

export async function POST(req: NextRequest) {
  // Read raw body BEFORE parsing — HMAC verification needs the exact bytes
  const rawBody = await req.text();
  const signature =
    req.headers.get("x-mayar-signature") ??
    req.headers.get("x-callback-token") ??
    req.headers.get("x-signature");

  if (!verifyWebhookSignature(rawBody, signature)) {
    return NextResponse.json(
      { ok: false, error: "Invalid signature" },
      { status: 401 },
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
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
  const normalized = normalizeMayarPayload(body);

  // Derive event type for the retry queue
  const status = String(normalized.status ?? "").toUpperCase();
  const event = String(normalized.event ?? "").toLowerCase();
  let eventType = "unknown";
  let externalRef = String(normalized.external_id ?? "");

  if (status === "PAID") {
    eventType = "invoice.paid";
  } else if (status === "EXPIRED" || event === "invoice.expired") {
    eventType = "invoice.expired";
  } else if (event === "refund.succeeded") {
    eventType = "refund.succeeded";
    externalRef = String(normalized.id ?? "");
  } else if (event === "refund.failed") {
    eventType = "refund.failed";
    externalRef = String(normalized.id ?? "");
  }

  // Idempotency: skip if we already PROCESSED this event.
  if (externalRef) {
    const existing = await prisma.webhookEvent.findFirst({
      where: { provider: "mayar", eventType, externalRef, status: "PROCESSED" },
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
