import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyWebhookSignature, isStripeConfigured } from "@/lib/stripe";
import { dispatchWebhookPayload } from "@/lib/webhook-processor";

export async function POST(req: NextRequest) {
  if (!isStripeConfigured()) {
    return NextResponse.json({ ok: false, error: "Stripe not configured" }, { status: 503 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ ok: false, error: "Missing signature" }, { status: 400 });
  }

  const rawBody = await req.text();
  const payload = verifyWebhookSignature(rawBody, signature);
  if (!payload) {
    return NextResponse.json({ ok: false, error: "Invalid signature" }, { status: 401 });
  }

  const eventType = String(payload.type ?? "unknown");
  const data = (payload.data as { object?: Record<string, unknown> })?.object ?? {};
  const externalRef = String(data.client_reference_id ?? data.id ?? "");

  if (externalRef) {
    const existing = await prisma.webhookEvent.findFirst({
      where: { provider: "stripe", eventType, externalRef, status: "PROCESSED" },
    });
    if (existing) {
      return NextResponse.json({ ok: true, idempotent: true });
    }
  }

  const webhookEvent = await prisma.webhookEvent.create({
    data: {
      provider: "stripe",
      eventType,
      externalRef,
      rawPayload: payload as never,
      status: "PROCESSING",
      attempts: 1,
      lastAttemptAt: new Date(),
    },
  });

  try {
    let result: { ok: boolean; status?: string; error?: string; httpStatus?: number };

    if (eventType === "checkout.session.completed") {
      const sessionData = data as Record<string, unknown>;
      const xenditShape = {
        external_id: String(sessionData.client_reference_id ?? ""),
        id: String(sessionData.id ?? ""),
        status: "PAID",
        paid_at: new Date().toISOString(),
        payment_method: "CREDIT_CARD",
      };
      result = await dispatchWebhookPayload(xenditShape);
    } else if (eventType === "charge.refunded") {
      const refundData = data as Record<string, unknown>;
      const refundShape = {
        id: String(refundData.id ?? ""),
        created: new Date().toISOString(),
      };
      result = await dispatchWebhookPayload({ ...refundShape, event: "refund.succeeded" });
    } else {
      result = { ok: true, status: "ignored" };
    }

    await prisma.webhookEvent.update({
      where: { id: webhookEvent.id },
      data: {
        status: result.ok ? "PROCESSED" : "FAILED",
        processedAt: result.ok ? new Date() : undefined,
        errorMessage: result.ok ? null : result.error ?? null,
      },
    });

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: result.httpStatus ?? 500 },
      );
    }
    return NextResponse.json({ ok: true, status: result.status });
  } catch (err) {
    console.error("[stripe-webhook] handler error:", err);
    await prisma.webhookEvent.update({
      where: { id: webhookEvent.id },
      data: {
        status: "FAILED",
        errorMessage: err instanceof Error ? err.message : String(err),
      },
    }).catch(() => {});
    return NextResponse.json({ ok: false, error: "Handler error" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
