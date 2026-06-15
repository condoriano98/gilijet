import { prisma } from "./db";
import type { WeatherCondition } from "@prisma/client";

export type WeatherRecord = {
  condition: WeatherCondition;
  waveHeight: number | null;
  windSpeedKnots: number | null;
  temperature: number | null;
  source: string;
  recordedAt: Date;
};

/**
 * Attach a weather snapshot to a leg. Used to record conditions at departure
 * time for post-hoc analysis of cancellations and delays.
 */
export async function recordWeather(legId: string, record: WeatherRecord): Promise<void> {
  await prisma.weatherSnapshot.create({
    data: {
      legId,
      condition: record.condition,
      waveHeight: record.waveHeight ?? null,
      windSpeedKnots: record.windSpeedKnots ?? null,
      temperature: record.temperature ?? null,
      source: record.source,
      recordedAt: record.recordedAt,
    },
  });
}

export function isSailable(
  condition: WeatherCondition,
): { sailable: boolean; warning?: string } {
  switch (condition) {
    case "CALM":
    case "MODERATE":
      return { sailable: true };
    case "ROUGH":
      return { sailable: true, warning: "Rough seas — expect delays" };
    case "SEVERE":
      return { sailable: false, warning: "Severe weather — sailings suspended" };
    case "CLOSED":
      return { sailable: false, warning: "Port closed due to weather" };
  }
}
