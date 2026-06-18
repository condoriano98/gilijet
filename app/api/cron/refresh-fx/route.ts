import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";

const CURRENCIES = ["USD", "EUR", "AUD", "SGD", "MYR", "THB", "CNY", "JPY", "KRW"];

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (env.CRON_SECRET && authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let fetched = 0;
  let failed = 0;

  try {
    const res = await fetch("https://api.exchangerate.host/latest?base=IDR&symbols=" + CURRENCIES.join(","));
    if (!res.ok) {
      console.error("[refresh-fx] API returned", res.status);
      return NextResponse.json({ ok: false, error: "FX API failed" }, { status: 502 });
    }
    const data = await res.json();
    const rates = data.rates as Record<string, number> | undefined;
    if (!rates) {
      return NextResponse.json({ ok: false, error: "No rates in response" }, { status: 502 });
    }

    for (const [currency, rate] of Object.entries(rates)) {
      if (typeof rate !== "number" || rate <= 0) continue;
      try {
        await prisma.fxRate.create({
          data: {
            currency,
            rate: 1 / rate,
            fetchedAt: new Date(),
          },
        });
        fetched++;
      } catch (err) {
        console.error(`[refresh-fx] failed to store ${currency}:`, err);
        failed++;
      }
    }
  } catch (err) {
    console.error("[refresh-fx] fetch failed:", err);
    return NextResponse.json({ ok: false, error: "Fetch failed" }, { status: 500 });
  }

  console.log(`[refresh-fx] fetched=${fetched} failed=${failed}`);
  return NextResponse.json({ ok: true, fetched, failed });
}

export const dynamic = "force-dynamic";
