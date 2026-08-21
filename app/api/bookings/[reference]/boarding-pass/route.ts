import { NextRequest } from "next/server";
import {
  boardingPassFilename,
  generateBoardingPassPdf,
} from "@/lib/boarding-pass";

/**
 * Download the boarding pass PDF for a confirmed booking.
 *
 * Unauthenticated by booking reference, matching the sibling `/ics` route and
 * the printable page at /print/b/[reference]: the reference is the credential.
 * It carries a 6-character cryptographically random suffix from
 * lib/references.ts (~1.07 billion per year-month), and this exposes nothing
 * the print page does not already.
 *
 * Returns 404 for anything not CONFIRMED, so a booking still waiting on the
 * operator call cannot be made to produce a pass early.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ reference: string }> },
) {
  const { reference } = await params;

  const pdf = await generateBoardingPassPdf(reference);
  if (!pdf) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      // `inline` so a phone opens it in the browser's viewer rather than
      // dropping it into Downloads unopened — it is shown at the dock, and the
      // filename still applies if the passenger chooses to save it.
      "Content-Disposition": `inline; filename="${boardingPassFilename(reference)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

export const dynamic = "force-dynamic";
