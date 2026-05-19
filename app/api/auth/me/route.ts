import { NextResponse } from "next/server";
import { getCustomerSession } from "@/lib/auth";

// Lightweight session probe used by the client-side AuthNav. Returns
// only what the UI needs — never the full JWT, never PII beyond the
// first name displayed in the header.
export async function GET() {
  try {
    const session = await getCustomerSession();
    if (!session) {
      return NextResponse.json({ signedIn: false });
    }
    return NextResponse.json({
      signedIn: true,
      firstName: session.fullName.split(" ")[0],
    });
  } catch (err) {
    console.error("[api/auth/me] failed:", err);
    return NextResponse.json({ signedIn: false });
  }
}

export const dynamic = "force-dynamic";
