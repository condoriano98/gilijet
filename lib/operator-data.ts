import { Prisma } from "@prisma/client";
import { prisma } from "./db";

/**
 * Operator-scoped data helpers. Every query enforces operatorId so a
 * compromised session can't reach another operator's data.
 */

export const activeOperator = { deletedAt: null };
export const activeBoat = { deletedAt: null };
export const activeSchedule = { deletedAt: null };

export async function getOperatorBoats(operatorId: string) {
  return prisma.boat.findMany({
    where: { operatorId, deletedAt: null },
    orderBy: { createdAt: "desc" },
  });
}

export async function getOperatorBoat(operatorId: string, boatId: string) {
  return prisma.boat.findFirst({
    where: { id: boatId, operatorId, deletedAt: null },
  });
}

export async function getOperatorSchedules(
  operatorId: string,
  where: Prisma.ScheduleWhereInput = {},
) {
  return prisma.schedule.findMany({
    where: {
      ...where,
      boat: { operatorId, deletedAt: null },
      deletedAt: null,
    },
    include: { boat: true, _count: { select: { legs: true } } },
    orderBy: [{ originPort: "asc" }, { departureTime: "asc" }],
  });
}

export async function getOperatorSchedule(operatorId: string, scheduleId: string) {
  return prisma.schedule.findFirst({
    where: { id: scheduleId, boat: { operatorId, deletedAt: null }, deletedAt: null },
    include: { boat: true },
  });
}

export async function getOperatorLeg(operatorId: string, legId: string) {
  return prisma.leg.findFirst({
    where: {
      id: legId,
      operatorId,
      schedule: { deletedAt: null, boat: { deletedAt: null } },
    },
    include: {
      schedule: { include: { boat: true } },
      bookings: {
        where: { status: "CONFIRMED" },
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
      operatorId,
      schedule: { deletedAt: null, boat: { deletedAt: null } },
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
