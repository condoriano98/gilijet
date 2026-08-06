import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { refreshRatesFromProvider } from "@/lib/fx";

/**
 * Keeps the FxRate table warm.
 *
 * The fetch itself lives in lib/fx.ts because quoteForeignCharge needs it too —
 * it refreshes inline when the table is cold, so this job is an optimisation
 * rather than a prerequisite for PayPal being offered.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!env.CRON_SECRET || authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const fetched = await refreshRatesFromProvider();
    console.log(`[refresh-fx] fetched=${fetched}`);
    return NextResponse.json({ ok: true, fetched });
  } catch (err) {
    console.error("[refresh-fx] fetch failed:", err);
    return NextResponse.json({ ok: false, error: "Fetch failed" }, { status: 502 });
  }
}

export const dynamic = "force-dynamic";
