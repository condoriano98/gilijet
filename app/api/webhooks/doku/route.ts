import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { dispatchWebhookPayload } from "@/lib/webhook-processor";
import { verifyDokuNotification } from "@/lib/doku";
import { normalizePaymentMethod } from "@/lib/psp";

/**
 * DOKU (Jokul) payment notification endpoint.
 *
 * DOKU POSTs a signed JSON body on payment events. We verify the HMAC
 * Signature over this path + raw body, map order.invoice_number → our booking
 * reference, normalise to the canonical webhook shape, and hand it to the
 * shared processor (which confirms the booking + issues tickets).
 *
 * Notification path is used as `Request-Target` in the signature, so keep the
 * DOKU dashboard's notification URL pointing exactly at /api/webhooks/doku.
 */
const NOTIFICATION_PATH = "/api/webhooks/doku";

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  if (!verifyDokuNotification(req, rawBody, NOTIFICATION_PATH)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ ok: false, error: "Empty payload" }, { status: 400 });
  }

  const body = payload as Record<string, unknown>;
  const order = (body.order ?? {}) as Record<string, unknown>;
  const transaction = (body.transaction ?? {}) as Record<string, unknown>;
  const channel = (body.channel ?? {}) as Record<string, unknown>;
  const acquirer = (body.acquirer ?? {}) as Record<string, unknown>;

  const externalRef = String(order.invoice_number ?? "");
  if (!externalRef) {
    return NextResponse.json({ ok: false, error: "Missing order.invoice_number" }, { status: 400 });
  }

  const rawStatus = String(transaction.status ?? "").toUpperCase();
  const channelId = String(channel.id ?? acquirer.id ?? "DOKU");

  // Normalise to the canonical shape dispatchWebhookPayload understands.
  let normalizedStatus = "";
  let normalizedEvent = "";
  let paymentMethod = "BANK_TRANSFER";
  if (rawStatus === "SUCCESS") {
    normalizedStatus = "PAID";
    normalizedEvent = "invoice.paid";
    try {
      paymentMethod = normalizePaymentMethod(channelId);
    } catch {
      paymentMethod = "BANK_TRANSFER";
    }
  } else if (rawStatus === "EXPIRED") {
    normalizedStatus = "EXPIRED";
    normalizedEvent = "invoice.expired";
  } else if (rawStatus === "FAILED") {
    // Failed attempts are not terminal for the booking (hold still runs).
    return NextResponse.json({ ok: true, ignored: true });
  }

  const normalized: Record<string, unknown> = {
    external_id: externalRef,
    id: String(transaction.original_request_id ?? order.invoice_number ?? ""),
    invoice_id: externalRef,
    status: normalizedStatus,
    event: normalizedEvent,
    paid_at: String(transaction.date ?? new Date().toISOString()),
    payment_method: paymentMethod,
    fees_paid_amount: 0,
    _raw: body,
  };

  const eventType = normalizedStatus === "PAID" ? "invoice.paid" : "invoice.expired";

  // Idempotency: skip if already processed or in-flight for this event.
  const existing = await prisma.webhookEvent.findFirst({
    where: {
      provider: "doku",
      eventType,
      externalRef,
      status: { in: ["PROCESSED", "PROCESSING"] },
    },
  });
  if (existing) {
    return NextResponse.json({ ok: true, idempotent: true });
  }

  const webhookEvent = await prisma.webhookEvent.create({
    data: {
      provider: "doku",
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
    return NextResponse.json({ ok: true, status: (result as { status: string }).status });
  } catch (err) {
    console.error("[doku-webhook] handler error:", err);
    await prisma.webhookEvent
      .update({
        where: { id: webhookEvent.id },
        data: {
          status: "FAILED",
          errorMessage: err instanceof Error ? err.message : String(err),
        },
      })
      .catch(() => {});
    return NextResponse.json({ ok: false, error: "Handler error" }, { status: 500 });
  }
}
