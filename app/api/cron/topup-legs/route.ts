import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { generateLegsForSchedule, seasonSeedParams } from "@/lib/legs";

/**
 * Cron: regenerate the July–August demo departures for every active schedule.
 * Idempotent (generateLegsForSchedule uses createMany skipDuplicates and is
 * season-clamped), so this keeps the season populated without depending on a
 * page visit. Secured by CRON_SECRET.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!env.CRON_SECRET || authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const schedules = await prisma.schedule.findMany({
    where: {
      status: "ACTIVE",
      deletedAt: null,
      boat: { status: "ACTIVE", deletedAt: null },
    },
    select: { id: true },
  });

  const { startAt, daysAhead } = seasonSeedParams();
  let created = 0;
  let failed = 0;
  for (const s of schedules) {
    try {
      created += await generateLegsForSchedule(s.id, daysAhead, startAt);
    } catch (err) {
      console.error(`[topup-legs] schedule ${s.id} failed:`, err);
      failed++;
    }
  }

  console.log(`[topup-legs] schedules=${schedules.length} created=${created} failed=${failed}`);
  return NextResponse.json({ ok: true, schedules: schedules.length, created, failed });
}

export const dynamic = "force-dynamic";
export const maxDuration = 300;
