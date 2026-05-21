"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

/**
 * One row per passenger. Each emits three inputs:
 *   passengerName[]     — required
 *   passengerIdNumber[] — optional in MVP (KTP / passport)
 *   passengerType[]     — ADULT (full) | CHILD (50%) | INFANT (free, no seat)
 */
export function PassengerFields({
  initialCount = 1,
  max = 10,
}: {
  initialCount?: number;
  max?: number;
}) {
  const [count, setCount] = React.useState(
    Math.max(1, Math.min(max, initialCount)),
  );

  return (
    <div className="space-y-3">
      {Array.from({ length: count }, (_, i) => (
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
              defaultValue="ADULT"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <option value="ADULT">Adult (full price)</option>
              <option value="CHILD">Child 3-12 (50% off)</option>
              <option value="INFANT">Infant &lt;3 (free)</option>
            </select>
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
          disabled={count >= max}
          onClick={() => setCount((c) => Math.min(max, c + 1))}
        >
          + Add passenger
        </Button>
        {count > 1 ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setCount((c) => Math.max(1, c - 1))}
          >
            Remove last
          </Button>
        ) : null}
      </div>

      <p className="text-xs text-muted-foreground">
        Children get a 50% discount. Infants under 3 travel free and share a
        seat with an accompanying adult.
      </p>
    </div>
  );
}
