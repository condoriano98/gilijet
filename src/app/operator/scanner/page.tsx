import { requireOperator } from '@/shared/server/auth';
import { getOperatorLegs } from '@/features/operators/data';
import { ScannerClient } from './scanner-client';
import { MS_PER_DAY, MS_PER_HOUR } from '@/shared/constants/time';

export default async function OperatorScannerPage({
  searchParams,
}: {
  searchParams: Promise<{ legId?: string }>;
}) {
  const session = await requireOperator();
  const { legId: initialLegId } = await searchParams;

  // Show today's legs and the next 3 days so scanner is useful both at the
  // dock and the night before.
  const now = new Date();
  const horizon = new Date(now.getTime() + 3 * MS_PER_DAY);
  const legs = await getOperatorLegs(session.sub, {
    fromUtc: new Date(now.getTime() - MS_PER_HOUR), // include legs that just sailed
    toUtc: horizon,
    take: 50,
  });

  const options = legs.map((l) => ({
    id: l.id,
    label: `${l.schedule.originPort} → ${l.schedule.destinationPort}`,
    boat: l.schedule.boat.name,
    departureDate: l.departureDate.toISOString(),
    status: l.status,
  }));

  return <ScannerClient options={options} initialLegId={initialLegId} />;
}
