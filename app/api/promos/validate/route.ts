import { NextResponse } from "next/server";
import { validatePromoCode } from "@/lib/promotions";

/**
 * GET /api/promos/validate?code=GILIJET15&amount=500000
 * Returns: { valid: true, discountAmount, description } | { valid: false, error }
 * Public — no auth. Doesn't mutate anything.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code") ?? "";
  const amount = Number(url.searchParams.get("amount") ?? "0");
  if (!code || amount <= 0) {
    return NextResponse.json(
      { valid: false, error: "Missing code or amount" },
      { status: 400 },
    );
  }
  try {
    const result = await validatePromoCode(code, amount);
    if (!result.valid) {
      return NextResponse.json({ valid: false, error: result.error });
    }
    return NextResponse.json({
      valid: true,
      discountAmount: result.discountAmount,
      description: result.promotion.description,
    });
  } catch (err) {
    console.error("[api/promos/validate] failed:", err);
    return NextResponse.json(
      { valid: false, error: "Could not validate code" },
      { status: 500 },
    );
  }
}

export const dynamic = "force-dynamic";
