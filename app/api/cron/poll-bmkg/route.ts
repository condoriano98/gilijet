import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { getAllPorts } from "@/lib/port-info";
import { isSailable } from "@/lib/weather-policy";
import type { WeatherCondition } from "@prisma/client";

function classifyCondition(waveHeightM: number, windKnots: number): WeatherCondition {
  const result = isSailable({ waveHeightM, windKnots });
  if (result.level === "UNSAFE") return "SEVERE";
  if (result.level === "BORDERLINE") return "ROUGH";
  if (waveHeightM > 0.5 || windKnots > 10) return "MODERATE";
  return "CALM";
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (env.CRON_SECRET && authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const ports = getAllPorts();
  let fetched = 0;
  let failed = 0;

  for (const port of ports) {
    if (port.lat === 0 && port.lng === 0) continue;

    try {
      const url = `https://api.bmkg.go.id/publik/prakiraan-maritim?lat=${port.lat}&lon=${port.lng}`;
      const res = await fetch(url, { next: { revalidate: 3600 } });

      if (!res.ok) {
        console.warn(`[poll-bmkg] BMKG returned ${res.status} for ${port.name}`);
        failed++;
        continue;
      }

      const data = await res.json();
      const forecast = data?.data?.[0];
      if (!forecast) {
        failed++;
        continue;
      }

      const waveHeightM = Number(forecast.wave_height ?? forecast.tinggi_gelombang ?? 0);
      const windKnots = Number(forecast.wind_speed ?? forecast.kecepatan_angin ?? 0);
      const condition = classifyCondition(waveHeightM, windKnots);
      const forecastFor = forecast.datetime ? new Date(forecast.datetime) : new Date();

      await prisma.weatherForecast.create({
        data: {
          portName: port.name,
          forecastFor,
          waveHeightM: waveHeightM || null,
          windKnots: windKnots || null,
          condition,
          fetchedAt: new Date(),
        },
      });
      fetched++;
    } catch (err) {
      console.error(`[poll-bmkg] failed for ${port.name}:`, err);
      failed++;
    }
  }

  console.log(`[poll-bmkg] fetched=${fetched} failed=${failed} total=${ports.length}`);
  return NextResponse.json({ ok: true, fetched, failed, total: ports.length });
}

export const dynamic = "force-dynamic";
