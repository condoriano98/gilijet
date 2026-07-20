import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { dispatchWebhookPayload } from "@/lib/webhook-processor";
import { verifyWebhookToken } from "@/lib/xendit";

/**
 * Xendit invoice webhook. Xendit POSTs the invoice payload with an
 * `x-callback-token` header; the body is already in the canonical shape the
 * shared processor understands (external_id + status), so we verify the token,
 * record the event for idempotency, and dispatch.
 *
 * Point the Xendit dashboard's callback URL at /api/webhooks/xendit.
 */
export async function POST(req: NextRequest) {
  const token = req.headers.get("x-callback-token");
  if (!verifyWebhookToken(token)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const rawBody = await req.text();
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const externalRef = String(body.external_id ?? "");
  if (!externalRef) {
    return NextResponse.json({ ok: false, error: "Missing external_id" }, { status: 400 });
  }

  const status = String(body.status ?? "").toUpperCase();
  const eventType =
    status === "PAID"
      ? "invoice.paid"
      : status === "EXPIRED"
        ? "invoice.expired"
        : "invoice.other";

  // Idempotency: skip if already processed or in-flight for this event.
  const existing = await prisma.webhookEvent.findFirst({
    where: {
      provider: "xendit",
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
