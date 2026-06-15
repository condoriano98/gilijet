import { prisma } from "./db";
import type { ScheduleType } from "@prisma/client";

export type TransitLeg = {
  scheduleId: string;
  originPort: string;
  destinationPort: string;
  arrivalTime: string;
  departureTime: string;
  orderIndex: number;
  isStop: boolean;
};

/**
 * For a TRANSIT schedule, expand the intermediate stops into a full
 * point-to-point journey description. Returns stops ordered by pickup order.
 */
export async function getTransitPath(scheduleId: string): Promise<TransitLeg[]> {
  const stops = await prisma.transitStop.findMany({
    where: { scheduleId },
    orderBy: { orderIndex: "asc" },
  });
  return stops.map((s, i) => ({
    scheduleId,
    originPort: i === 0 ? s.portName : stops[i - 1].portName,
    destinationPort: s.portName,
    arrivalTime: s.arrivalTime,
    departureTime: s.departureTime,
    orderIndex: s.orderIndex,
    isStop: true,
  }));
}

/**
 * Determine if a schedule is a direct or transit route.
 */
export function isTransitRoute(scheduleType: ScheduleType): boolean {
  return scheduleType === "TRANSIT";
}
