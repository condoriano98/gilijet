'use client';

import { formatIDR } from '@/shared/lib/utils';
import { useBookingPrice } from '@/app/(customer)/[locale]/book/[legId]/_components/booking-price-provider';
import type { PassengerType } from '@/features/pricing/pricing';

const ORDER: PassengerType[] = ['ADULT', 'CHILD', 'INFANT'];

export function BookingPriceSummary() {
  const { types, unitPriceFor, total, legTotals } = useBookingPrice();

  const counts: Record<PassengerType, number> = { ADULT: 0, CHILD: 0, INFANT: 0 };
  for (const t of types) counts[t]++;

  return (
    <div className="mt-4 space-y-2.5 border-t border-brand-line pt-4 text-sm">
      {ORDER.filter((t) => counts[t] > 0).map((t) => (
        <div key={t} className="flex justify-between">
          <span className="text-brand-muted">
            {counts[t]} × {t} ({formatIDR(unitPriceFor(t))})
          </span>
          <span className="font-semibold tabular-nums">{formatIDR(unitPriceFor(t) * counts[t])}</span>
        </div>
      ))}
      {legTotals ? (
        <div className="space-y-2.5 border-t border-brand-line pt-3">
          <div className="flex justify-between">
            <span className="text-brand-muted">Outbound</span>
            <span className="tabular-nums">{formatIDR(legTotals.outbound)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-brand-muted">Return</span>
            <span className="tabular-nums">{formatIDR(legTotals.return)}</span>
          </div>
        </div>
      ) : null}
      <div className="flex items-baseline justify-between border-t border-brand-line pt-4 font-bold">
        <span>Total</span>
        <span className="text-2xl font-extrabold tracking-tight text-brand tabular-nums">{formatIDR(total)}</span>
      </div>
    </div>
  );
}
