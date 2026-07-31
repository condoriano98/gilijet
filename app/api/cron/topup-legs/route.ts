import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { BOOKING_HORIZON_DAYS, generateLegsForSchedule } from "@/lib/legs";

/**
 * Cron: keep the next BOOKING_HORIZON_DAYS of departures populated for every
 * active schedule. Idempotent — generateLegsForSchedule uses createMany with
 * skipDuplicates against the unique (scheduleId, departureDate).
 *
 * This used to run on seasonSeedParams(), which clamps to a July–August demo
 * window and therefore generated nothing from about September until the
 * following July. Schedules kept only the 14 days of legs created with them and
 * then ran dry with no signal. seasonSeedParams stays where it belongs, in the
 * seed scripts. Secured by CRON_SECRET.
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

  let created = 0;
  let failed = 0;
  for (const s of schedules) {
    try {
      created += await generateLegsForSchedule(s.id, BOOKING_HORIZON_DAYS);
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
