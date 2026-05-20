import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { dispatchWebhookPayload } from "@/lib/webhook-processor";

/**
 * Cron job: retries PENDING or FAILED webhook events.
 * Called by Vercel cron every 5 minutes.
 * Secured by CRON_SECRET header (set in vercel.json and env).
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (env.CRON_SECRET && authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);

  // Pick events that need retry: PENDING > 2 min old, or FAILED < 5 attempts
  const events = await prisma.webhookEvent.findMany({
    where: {
      provider: "xendit",
      status: { in: ["PENDING", "FAILED"] },
      attempts: { lt: 5 },
      lastAttemptAt: { lt: twoMinutesAgo },
    },
    orderBy: { createdAt: "asc" },
    take: 20,
  });

  let processed = 0;
  let failed = 0;

  for (const event of events) {
    const body = event.rawPayload as Record<string, unknown>;

    // Mark as processing to prevent parallel retry
    await prisma.webhookEvent.update({
      where: { id: event.id },
      data: {
        status: "PROCESSING",
        attempts: { increment: 1 },
        lastAttemptAt: new Date(),
      },
    });

    try {
      const result = await dispatchWebhookPayload(body);
      await prisma.webhookEvent.update({
        where: { id: event.id },
        data: {
          status: result.ok ? "PROCESSED" : "FAILED",
          processedAt: result.ok ? new Date() : undefined,
          errorMessage: result.ok ? null : (result as { error: string }).error,
        },
      });
      if (result.ok) processed++;
      else failed++;
    } catch (err) {
      await prisma.webhookEvent.update({
        where: { id: event.id },
        data: {
          status: "FAILED",
          errorMessage: err instanceof Error ? err.message : String(err),
        },
      }).catch(() => {});
      failed++;
    }
  }

  console.log(`[retry-webhooks] processed=${processed} failed=${failed} total=${events.length}`);
  return NextResponse.json({ ok: true, processed, failed, total: events.length });
}

export const dynamic = "force-dynamic";
