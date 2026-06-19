import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth";
import { pingXendit } from "@/lib/xendit";

export const dynamic = "force-dynamic";

export async function GET() {
  await requireSuperAdmin();
  const result = await pingXendit();
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
