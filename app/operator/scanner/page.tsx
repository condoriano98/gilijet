import { requireOperator } from "@/lib/auth";
import { getOperatorLegs } from "@/lib/operator-data";
import { ScannerClient } from "./scanner-client";

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
  const horizon = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  const legs = await getOperatorLegs(session.sub, {
    fromUtc: new Date(now.getTime() - 60 * 60 * 1000), // include legs that just sailed
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
