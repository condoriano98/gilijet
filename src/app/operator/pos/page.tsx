import { requireOperator } from '@/shared/server/auth';
import { prisma } from '@/shared/server/db';
import { formatLocalTime } from '@/shared/lib/datetime';
import { loadActiveSeasons, legPricingInputs } from '@/features/pricing/seasons';
import { resolvePlatformPricing } from '@/shared/server/platform-config';
import { PosClient } from './pos-client';
import { MS_PER_HOUR } from '@/shared/constants/time';

export default async function PosPage() {
  const session = await requireOperator();
  const operatorId = session.sub;

  const now = new Date();
  const eightHoursLater = new Date(now.getTime() + 8 * MS_PER_HOUR);

  const [legs, pricing] = await Promise.all([
    prisma.leg.findMany({
      where: {
        operatorId,
        status: 'OPEN',
        departureDate: { gte: now, lte: eightHoursLater },
        schedule: { status: 'ACTIVE', deletedAt: null, boat: { deletedAt: null } },
      },
      include: { schedule: { include: { boat: true } } },
      orderBy: { departureDate: 'asc' },
      take: 30,
    }),
    resolvePlatformPricing(operatorId),
  ]);

  // Same season-aware resolution the booking engine charges with, so this
  // preview never disagrees with what the customer is actually charged.
  const seasons = await loadActiveSeasons();
  const legOptions = legs.flatMap((leg) => {
    const inputs = legPricingInputs(leg, seasons);
    if (inputs.closed) return [];
    const basePrice = Number(inputs.unitPrice);
    const childPrice = inputs.categoryUnitPrices?.CHILD ?? basePrice * (pricing.multipliers?.CHILD ?? 0.5);
    const infantPrice = inputs.categoryUnitPrices?.INFANT ?? basePrice * (pricing.multipliers?.INFANT ?? 0);
    return [
      {
        id: leg.id,
        route: `${leg.schedule.originPort} → ${leg.schedule.destinationPort}`,
        boatName: leg.schedule.boat.name,
        departureTime: formatLocalTime(leg.departureDate),
        basePrice,
        childPrice,
        infantPrice,
      },
    ];
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
