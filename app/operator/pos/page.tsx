import { requireOperator } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatLocalTime } from "@/lib/datetime";
import { PosClient } from "./pos-client";

export default async function PosPage() {
  const session = await requireOperator();
  const operatorId = session.sub;

  const now = new Date();
  const eightHoursLater = new Date(now.getTime() + 8 * 60 * 60 * 1000);

  const legs = await prisma.leg.findMany({
    where: {
      operatorId,
      status: "OPEN",
      availableSeats: { gt: 0 },
      departureDate: { gte: now, lte: eightHoursLater },
      schedule: { status: "ACTIVE", deletedAt: null, boat: { deletedAt: null } },
    },
    include: { schedule: { include: { boat: true } } },
    orderBy: { departureDate: "asc" },
    take: 30,
  });

  const legOptions = legs.map((leg) => ({
    id: leg.id,
    route: `${leg.schedule.originPort} → ${leg.schedule.destinationPort}`,
    boatName: leg.schedule.boat.name,
    departureTime: formatLocalTime(leg.departureDate),
    basePrice: Number(leg.basePrice),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-mekari-neutral-900">Kasir Pelabuhan</h1>
        <p className="text-sm text-mekari-neutral-500">
          Penjualan tiket walk-in untuk keberangkatan hari ini
        </p>
      </div>
      <PosClient legs={legOptions} />
    </div>
  );
}
