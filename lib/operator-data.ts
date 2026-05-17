import { Prisma } from "@prisma/client";
import { prisma } from "./db";

/**
 * Operator-scoped data helpers. Every query enforces operatorId so a
 * compromised session can't reach another operator's data.
 */

export async function getOperatorBoats(operatorId: string) {
  return prisma.boat.findMany({
    where: { operatorId },
    orderBy: { createdAt: "desc" },
  });
}

export async function getOperatorBoat(operatorId: string, boatId: string) {
  return prisma.boat.findFirst({
    where: { id: boatId, operatorId },
  });
}

export async function getOperatorSchedules(
  operatorId: string,
  where: Prisma.ScheduleWhereInput = {},
) {
  return prisma.schedule.findMany({
    where: {
      ...where,
      boat: { operatorId },
    },
    include: { boat: true, _count: { select: { legs: true } } },
    orderBy: [{ originPort: "asc" }, { departureTime: "asc" }],
  });
}

export async function getOperatorSchedule(operatorId: string, scheduleId: string) {
  return prisma.schedule.findFirst({
    where: { id: scheduleId, boat: { operatorId } },
    include: { boat: true },
  });
}

export async function getOperatorLeg(operatorId: string, legId: string) {
  return prisma.leg.findFirst({
    where: { id: legId, schedule: { boat: { operatorId } } },
    include: {
      schedule: { include: { boat: true } },
      bookings: {
        include: { tickets: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
}

export async function getOperatorLegs(
  operatorId: string,
  args: {
    fromUtc?: Date;
    toUtc?: Date;
    status?: "OPEN" | "FULL" | "SAILED" | "CANCELLED";
    take?: number;
  } = {},
) {
  return prisma.leg.findMany({
    where: {
      schedule: { boat: { operatorId } },
      ...(args.fromUtc || args.toUtc
        ? {
            departureDate: {
              ...(args.fromUtc ? { gte: args.fromUtc } : {}),
              ...(args.toUtc ? { lte: args.toUtc } : {}),
            },
          }
        : {}),
      ...(args.status ? { status: args.status } : {}),
    },
    include: { schedule: { include: { boat: true } } },
    orderBy: { departureDate: "asc" },
    take: args.take ?? 200,
  });
}
