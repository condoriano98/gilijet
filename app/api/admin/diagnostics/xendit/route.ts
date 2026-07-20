import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { pingXendit } from "@/lib/xendit";

/**
 * Super-admin diagnostic: reports whether Xendit is configured and in which
 * mode (live / test / mock). No funds move.
 */
export async function GET() {
  const session = await getAdminSession();
  if (!session || session.adminRole !== "SUPER_ADMIN") {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(pingXendit());
}

export const dynamic = "force-dynamic";
