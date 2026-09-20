"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { formatIDR } from "@/lib/utils";
import { useBookingPrice } from "./booking-price-provider";
import type { PassengerType } from "@/lib/pricing";

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
    <div className="space-y-3">
      {types.map((type, i) => (
        <div
          key={i}
          className="grid gap-2 rounded-md border bg-card p-3 sm:grid-cols-[1fr_160px_180px]"
        >
          <div className="space-y-1">
            <Label htmlFor={`passengerName-${i}`}>
              Passenger {i + 1} name
            </Label>
            <Input
              id={`passengerName-${i}`}
              name="passengerName"
              required
              autoComplete="off"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`passengerType-${i}`}>Type</Label>
            <select
              id={`passengerType-${i}`}
              name="passengerType"
              value={type}
              onChange={(e) => setType(i, e.target.value as PassengerType)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <option value="ADULT">ADULT</option>
              <option value="CHILD">CHILD</option>
              <option value="INFANT">INFANT</option>
            </select>
            <p className="text-xs text-muted-foreground">
              {formatIDR(unitPriceFor(type))}
            </p>
          </div>
          <div className="space-y-1">
            <Label htmlFor={`passengerId-${i}`}>
              ID / passport (optional)
            </Label>
            <Input
              id={`passengerId-${i}`}
              name="passengerIdNumber"
              autoComplete="off"
            />
          </div>
        </div>
      ))}

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
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
            onClick={removePassenger}
          >
            Remove last
          </Button>
        ) : null}
      </div>

      <p className="text-xs text-muted-foreground">
        Child: ages 3–12. Infant: under 3, shares a seat with an accompanying
        adult.
      </p>
    </div>
  );
}
