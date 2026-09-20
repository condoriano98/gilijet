import { requireOperator } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatLocalTime } from "@/lib/datetime";
import { parseFareMatrix, categoryFaresFor } from "@/lib/fares";
import { resolvePlatformPricing } from "@/lib/platform-config";
import { PosClient } from "./pos-client";

export default async function PosPage() {
  const session = await requireOperator();
  const operatorId = session.sub;

  const now = new Date();
  const eightHoursLater = new Date(now.getTime() + 8 * 60 * 60 * 1000);

  const [legs, pricing] = await Promise.all([
    prisma.leg.findMany({
      where: {
        operatorId,
        status: "OPEN",
        departureDate: { gte: now, lte: eightHoursLater },
        schedule: { status: "ACTIVE", deletedAt: null, boat: { deletedAt: null } },
      },
      include: { schedule: { include: { boat: true } } },
      orderBy: { departureDate: "asc" },
      take: 30,
    }),
    resolvePlatformPricing(operatorId),
  ]);

  // Same fareMatrix-first, multiplier-fallback resolution the booking engine
  // charges with (lib/booking-engine.ts), so this preview never disagrees
  // with what the customer is actually charged.
  const legOptions = legs.map((leg) => {
    const basePrice = Number(leg.basePrice);
    const fareMatrix = parseFareMatrix(leg.schedule.fareMatrix);
    const fares = fareMatrix ? categoryFaresFor(fareMatrix) : null;
    const childPrice = fares ? fares.child : basePrice * (pricing.multipliers?.CHILD ?? 0.5);
    const infantPrice = fares ? fares.infant : basePrice * (pricing.multipliers?.INFANT ?? 0);
    return {
      id: leg.id,
      route: `${leg.schedule.originPort} → ${leg.schedule.destinationPort}`,
      boatName: leg.schedule.boat.name,
      departureTime: formatLocalTime(leg.departureDate),
      basePrice,
      childPrice,
      infantPrice,
    };
  });

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
