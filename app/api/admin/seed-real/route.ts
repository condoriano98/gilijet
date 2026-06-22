import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { getAdminSession } from "@/lib/auth";
import { seedRealData } from "@/lib/seed-data";

/**
 * One-off seed endpoint for production. Requires BOTH:
 *   1. An authenticated SUPER_ADMIN session, AND
 *   2. `Authorization: Bearer <SEED_TOKEN>` header matching the server env.
 *
 * Token must be in the header — never the query string — so it doesn't leak
 * into access logs, proxy logs, or browser history.
 *
 * Idempotent — upserts all rows. Safe to re-run.
 */
export async function GET(req: Request) {
  const expected = process.env.SEED_TOKEN;
  if (!expected) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "SEED_TOKEN env var not set on server — set it in env and redeploy to enable this endpoint.",
      },
      { status: 503 },
    );
  }

  const session = await getAdminSession();
  if (!session || session.adminRole !== "SUPER_ADMIN") {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const auth = req.headers.get("authorization");
  const provided = auth?.toLowerCase().startsWith("bearer ")
    ? auth.slice(7).trim()
    : null;
  if (!provided) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
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
