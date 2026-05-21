import { NextResponse } from "next/server";
import { seedRealData } from "@/lib/seed-data";

/**
 * One-off seed endpoint for production. Guarded by SEED_TOKEN env var.
 *
 * Usage:
 *   curl "https://your-app.vercel.app/api/admin/seed-real?token=YOUR_SEED_TOKEN"
 *
 * Idempotent — upserts all rows. Safe to re-run.
 *
 * Returns 401 if token mismatch, 503 if SEED_TOKEN isn't set on the server
 * (disabled state), 200 + JSON summary on success.
 */
export async function GET(req: Request) {
  const expected = process.env.SEED_TOKEN;
  if (!expected) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "SEED_TOKEN env var not set on server — set it in Vercel env and redeploy to enable this endpoint.",
      },
      { status: 503 },
    );
  }

  const url = new URL(req.url);
  const provided = url.searchParams.get("token");
  if (!provided || provided !== expected) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await seedRealData();
    return NextResponse.json({
      ok: true,
      message: "Seeded real Padang Bai ↔ Gili operators",
      ...result,
    });
  } catch (err) {
    console.error("[api/admin/seed-real] failed:", err);
    const message = err instanceof Error ? err.message : "Seed failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
// Allow up to 5 minutes — seeding generates ~7 days of legs per schedule
export const maxDuration = 300;
