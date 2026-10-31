'use client';

import * as React from 'react';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Button } from '@/shared/ui/button';
import { formatIDR } from '@/shared/lib/utils';
import { useBookingPrice } from '@/app/(customer)/[locale]/book/[legId]/_components/booking-price-provider';
import type { PassengerType } from '@/features/pricing/pricing';

/**
 * One row per passenger. Each emits three inputs:
 *   passengerName[]     — required
 *   passengerIdNumber[] — optional in MVP (KTP / passport)
 *   passengerType[]     — ADULT | CHILD | INFANT (no seat). Fare per type
 *                         follows the boat's price list — see lib/pricing.ts.
 * Count and type live in BookingPriceProvider so the price summary, promo
 * preview and submit button stay in sync with what's selected here.
 */
export function PassengerFields() {
  const { types, setType, addPassenger, removePassenger, unitPriceFor, max } =
    useBookingPrice();

  return (
    <div className="space-y-4">
      {types.map((type, i) => (
        <div
          key={i}
          className="grid gap-3 rounded-[18px] border border-brand-line bg-white p-4 sm:grid-cols-[1fr_160px_180px]"
        >
          <div className="space-y-1.5">
            <Label htmlFor={`passengerName-${i}`} className="text-[13px] font-semibold text-brand-text">
              Passenger {i + 1} name
            </Label>
            <Input
              id={`passengerName-${i}`}
              name="passengerName"
              required
              autoComplete="off"
              className="h-12 rounded-[14px] border-brand-line px-3.5 text-base"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`passengerType-${i}`} className="text-[13px] font-semibold text-brand-text">Type</Label>
            <select
              id={`passengerType-${i}`}
              name="passengerType"
              value={type}
              onChange={(e) => setType(i, e.target.value as PassengerType)}
              className="flex h-12 w-full rounded-[14px] border border-brand-line bg-white px-3 py-2 text-base ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <option value="ADULT">ADULT</option>
              <option value="CHILD">CHILD</option>
              <option value="INFANT">INFANT</option>
            </select>
            <p className="text-xs text-brand-muted">
              {formatIDR(unitPriceFor(type))}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`passengerId-${i}`} className="text-[13px] font-semibold text-brand-text">
              ID / passport (optional)
            </Label>
            <Input
              id={`passengerId-${i}`}
              name="passengerIdNumber"
              autoComplete="off"
              className="h-12 rounded-[14px] border-brand-line px-3.5 text-base"
            />
          </div>
        </div>
      ))}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-11 rounded-[14px] border-brand px-4 font-semibold text-brand hover:bg-brand-periwinkle"
          disabled={types.length >= max}
          onClick={addPassenger}
        >
          + Add passenger
        </Button>
        {types.length > 1 ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-11 rounded-[14px] px-4 text-brand-muted"
            onClick={removePassenger}
          >
            Remove last
          </Button>
        ) : null}
      </div>

      <p className="text-[13px] leading-relaxed text-brand-muted">
        Child: ages 3–12. Infant: under 3, shares a seat with an accompanying
        adult.
      </p>
    </div>
  );
}
