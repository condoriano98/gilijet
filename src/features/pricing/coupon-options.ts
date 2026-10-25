import { prisma } from '@/shared/server/db';
import { activeBoat, activeOperator, activeSchedule } from '@/features/operators/data';

export type CouponTargetOption = { value: string; label: string };

/**
 * What a coupon can be limited to: the routes that have a live schedule and the
 * operators that are trading. A route value is `originPort-destinationPort` as
 * stored on the schedule, which is exactly what the booking engine compares a
 * coupon's route list against.
 */
export async function getCouponTargetOptions(): Promise<{
  routes: CouponTargetOption[];
  operators: CouponTargetOption[];
}> {
  const [schedules, operators] = await Promise.all([
    prisma.schedule.findMany({
      where: {
        ...activeSchedule,
        status: 'ACTIVE',
        boat: { ...activeBoat, status: 'ACTIVE', operator: { ...activeOperator, status: 'ACTIVE' } },
      },
      select: { originPort: true, destinationPort: true },
      distinct: ['originPort', 'destinationPort'],
      orderBy: [{ originPort: 'asc' }, { destinationPort: 'asc' }],
    }),
    prisma.operator.findMany({
      where: { ...activeOperator, status: 'ACTIVE' },
      select: { id: true, companyName: true },
      orderBy: { companyName: 'asc' },
    }),
  ]);

  return {
    routes: schedules.map((s) => ({
      value: `${s.originPort}-${s.destinationPort}`,
      label: `${s.originPort} → ${s.destinationPort}`,
    })),
    operators: operators.map((o) => ({ value: o.id, label: o.companyName })),
  };
}

/**
 * Add the values a coupon already holds that are no longer offered (a retired
 * route, a suspended operator), so editing it does not silently drop them.
 */
export function withKeptValues(
  options: CouponTargetOption[],
  kept: string[],
): CouponTargetOption[] {
  const known = new Set(options.map((o) => o.value));
  const extra = kept
    .filter((v) => !known.has(v))
    .map((v) => ({ value: v, label: `${v} (no longer active)` }));
  return [...options, ...extra];
}
