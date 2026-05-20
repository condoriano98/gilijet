import type { Prisma } from "@prisma/client";
import { prisma } from "./db";

const MIN_TRANSFER_MINUTES = 45;

type LegWithSchedule = Prisma.LegGetPayload<{
  include: { schedule: { include: { boat: true } } };
}>;

export type ConnectionPair = {
  leg1: LegWithSchedule;
  leg2: LegWithSchedule;
  transferPort: string;
  totalDurationMinutes: number;
  totalPrice: number;
  transferWaitMinutes: number;
};

/**
 * Finds single-transfer connections between origin and destination on a given
 * day. Returns up to 10 cheapest pairs, sorted by totalPrice asc.
 */
export async function findConnections(
  origin: string,
  destination: string,
  startUtc: Date,
  endUtc: Date,
  passengers: number,
): Promise<ConnectionPair[]> {
  const leg1Candidates = await prisma.leg.findMany({
    where: {
      departureDate: { gte: startUtc, lte: endUtc },
      status: "OPEN",
      availableSeats: { gte: passengers },
      schedule: {
        is: {
          originPort: { equals: origin, mode: "insensitive" },
          status: "ACTIVE",
          destinationPort: { not: { equals: destination, mode: "insensitive" } as never },
        },
      },
    },
    include: { schedule: { include: { boat: true } } },
    take: 20,
  });

  if (leg1Candidates.length === 0) return [];

  const connections: ConnectionPair[] = [];
  // Extended end window: allow leg2 to depart up to end of next day
  const leg2EndUtc = new Date(endUtc.getTime() + 12 * 60 * 60 * 1000);

  for (const leg1 of leg1Candidates) {
    const transferPort = leg1.schedule.destinationPort;
    const arrivalAtTransfer = new Date(
      leg1.departureDate.getTime() +
        leg1.schedule.durationMinutes * 60 * 1000,
    );
    const earliestDeparture = new Date(
      arrivalAtTransfer.getTime() + MIN_TRANSFER_MINUTES * 60 * 1000,
    );

    const leg2Candidates = await prisma.leg.findMany({
      where: {
        departureDate: { gte: earliestDeparture, lte: leg2EndUtc },
        status: "OPEN",
        availableSeats: { gte: passengers },
        schedule: {
          is: {
            originPort: { equals: transferPort, mode: "insensitive" },
            destinationPort: { equals: destination, mode: "insensitive" },
            status: "ACTIVE",
          },
        },
      },
      include: { schedule: { include: { boat: true } } },
      take: 3,
    });

    for (const leg2 of leg2Candidates) {
      const transferWaitMinutes = Math.round(
        (leg2.departureDate.getTime() - arrivalAtTransfer.getTime()) / 60000,
      );
      const totalDurationMinutes =
        leg1.schedule.durationMinutes +
        transferWaitMinutes +
        leg2.schedule.durationMinutes;
      const totalPrice = Number(leg1.basePrice) + Number(leg2.basePrice);

      connections.push({
        leg1,
        leg2,
        transferPort,
        totalDurationMinutes,
        totalPrice,
        transferWaitMinutes,
      });
    }
  }

  return connections
    .sort((a, b) => a.totalPrice - b.totalPrice)
    .slice(0, 10);
}
