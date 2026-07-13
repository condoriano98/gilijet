import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { pingDoku } from "@/lib/doku";

/**
 * Super-admin diagnostic: reports whether DOKU is configured and in which
 * mode (live / sandbox / mock). No funds move. Mirrors the old Xendit ping.
 */
export async function GET() {
  const session = await getAdminSession();
  if (!session || session.adminRole !== "SUPER_ADMIN") {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(pingDoku());
}

export const dynamic = "force-dynamic";
