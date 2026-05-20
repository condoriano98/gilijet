import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyWebhookToken } from "@/lib/xendit";
import { dispatchWebhookPayload } from "@/lib/webhook-processor";

/**
 * Xendit webhook endpoint.
 * 1. Verify token
 * 2. Persist raw payload as WebhookEvent (enables retry on failure)
 * 3. Process immediately
 * 4. Mark event PROCESSED or FAILED
 */
export async function POST(req: NextRequest) {
  const token = req.headers.get("x-callback-token");
  if (!verifyWebhookToken(token)) {
    return NextResponse.json(
      { ok: false, error: "Invalid callback token" },
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
  const status = String(body.status ?? "").toUpperCase();
  const event = String(body.event ?? "").toLowerCase();

  // Derive a human-readable event type and external ref for the retry queue.
  let eventType = "unknown";
  let externalRef = "";

  if (status === "PAID") {
    eventType = "invoice.paid";
    externalRef = String(body.external_id ?? "");
  } else if (status === "EXPIRED" || event === "invoice.expired") {
    eventType = "invoice.expired";
    externalRef = String(body.external_id ?? "");
  } else if (event === "refund.succeeded") {
    eventType = "refund.succeeded";
    externalRef = String(body.id ?? "");
  } else if (event === "refund.failed") {
    eventType = "refund.failed";
    externalRef = String(body.id ?? "");
  }

  // Idempotency: skip if we already PROCESSED this event.
  if (externalRef) {
    const existing = await prisma.webhookEvent.findFirst({
      where: { provider: "xendit", eventType, externalRef, status: "PROCESSED" },
    });
    if (existing) {
      return NextResponse.json({ ok: true, idempotent: true });
    }
  }

  // Persist event for retry queue.
  const webhookEvent = await prisma.webhookEvent.create({
    data: {
      provider: "xendit",
      eventType,
      externalRef,
      rawPayload: body as never,
      status: "PROCESSING",
      attempts: 1,
      lastAttemptAt: new Date(),
    },
  });

  try {
    const result = await dispatchWebhookPayload(body);

    await prisma.webhookEvent.update({
      where: { id: webhookEvent.id },
      data: {
        status: result.ok ? "PROCESSED" : "FAILED",
        processedAt: result.ok ? new Date() : undefined,
        errorMessage: result.ok ? null : (result as { error: string }).error,
      },
    });

    if (!result.ok && (result as { httpStatus?: number }).httpStatus === 404) {
      // Ack 404s so Xendit doesn't endlessly retry for missing bookings.
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
    console.error("[xendit-webhook] handler error:", err);
    await prisma.webhookEvent.update({
      where: { id: webhookEvent.id },
      data: {
        status: "FAILED",
        errorMessage: err instanceof Error ? err.message : String(err),
      },
    }).catch(() => {});
    return NextResponse.json(
      { ok: false, error: "Handler error" },
      { status: 500 },
    );
  }
}
