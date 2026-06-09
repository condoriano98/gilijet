import { prisma } from "./db";

export type DepartingSoon = {
  legId: string;
  origin: string;
  destination: string;
  departureUtc: string;
  availableSeats: number;
  totalCapacity: number;
  priceIDR: number;
  operatorName: string;
  boatName: string;
};

export async function getDepartingSoon(
  args: { hoursAhead?: number; limit?: number } = {},
): Promise<DepartingSoon[]> {
  const hoursAhead = args.hoursAhead ?? 6;
  const limit = args.limit ?? 8;
  const now = new Date();
  const end = new Date(now.getTime() + hoursAhead * 60 * 60 * 1000);

  const legs = await prisma.leg.findMany({
    where: {
      status: "OPEN",
      availableSeats: { gte: 1 },
      departureDate: { gte: now, lte: end },
      schedule: { deletedAt: null, boat: { deletedAt: null } },
    },
    include: {
      schedule: {
        include: {
          boat: { include: { operator: true } },
        },
      },
    },
    orderBy: { departureDate: "asc" },
    take: limit,
  });

  return legs.map((leg) => ({
    legId: leg.id,
    origin: leg.schedule.originPort,
    destination: leg.schedule.destinationPort,
    departureUtc: leg.departureDate.toISOString(),
    availableSeats: leg.availableSeats,
    totalCapacity: leg.totalCapacity,
    priceIDR: Number(leg.basePrice),
    operatorName: leg.schedule.boat.operator.companyName,
    boatName: leg.schedule.boat.name,
  }));
}
