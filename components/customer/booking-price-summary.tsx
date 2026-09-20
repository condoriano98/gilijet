"use client";

import { CardContent } from "@/components/ui/card";
import { formatIDR } from "@/lib/utils";
import { useBookingPrice } from "./booking-price-provider";
import type { PassengerType } from "@/lib/pricing";

const ORDER: PassengerType[] = ["ADULT", "CHILD", "INFANT"];

export function BookingPriceSummary() {
  const { types, unitPriceFor, total } = useBookingPrice();

  const counts: Record<PassengerType, number> = { ADULT: 0, CHILD: 0, INFANT: 0 };
  for (const t of types) counts[t]++;

  return (
    <CardContent className="space-y-1 text-sm">
      {ORDER.filter((t) => counts[t] > 0).map((t) => (
        <div key={t} className="flex justify-between">
          <span className="text-muted-foreground">
            {counts[t]} × {t} ({formatIDR(unitPriceFor(t))})
          </span>
          <span>{formatIDR(unitPriceFor(t) * counts[t])}</span>
        </div>
      ))}
      <div className="flex justify-between border-t pt-1 font-semibold">
        <span>Total</span>
        <span>{formatIDR(total)}</span>
      </div>
    </CardContent>
  );
}
