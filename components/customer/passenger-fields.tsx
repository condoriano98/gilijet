"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

/**
 * One row per passenger. Each emits two inputs:
 *   passengerName[]    — required
 *   passengerIdNumber[] — optional in MVP (KTP / passport)
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
          className="grid gap-2 rounded-md border bg-card p-3 sm:grid-cols-[1fr_220px]"
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
    </div>
  );
}
