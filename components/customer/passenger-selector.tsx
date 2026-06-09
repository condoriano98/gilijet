"use client";

import * as React from "react";
import * as Popover from "@radix-ui/react-popover";
import { Button } from "@/components/ui/button";
import { ChevronDown, Minus, Plus } from "lucide-react";

export type PassengerCounts = {
  adults: number;
  children: number;
  infants: number;
};

type PassengerSelectorProps = {
  value: PassengerCounts;
  onChange: (counts: PassengerCounts) => void;
  maxTotal?: number;
};

const MAX_TOTAL_DEFAULT = 10;

function CounterRow({
  label,
  description,
  value,
  onIncrement,
  onDecrement,
  decrementDisabled,
  incrementDisabled,
}: {
  label: string;
  description: string;
  value: number;
  onIncrement: () => void;
  onDecrement: () => void;
  decrementDisabled: boolean;
  incrementDisabled: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-3">
      <div>
        <div className="text-sm font-medium text-slate-900">{label}</div>
        <div className="text-xs text-slate-500">{description}</div>
      </div>
      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={onDecrement}
          disabled={decrementDisabled}
          aria-label={`Decrease ${label}`}
        >
          <Minus className="h-3.5 w-3.5" />
        </Button>
        <span className="w-6 text-center text-sm font-semibold tabular-nums">
          {value}
        </span>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={onIncrement}
          disabled={incrementDisabled}
          aria-label={`Increase ${label}`}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

export function PassengerSelector({
  value,
  onChange,
  maxTotal = MAX_TOTAL_DEFAULT,
}: PassengerSelectorProps) {
  const [open, setOpen] = React.useState(false);
  const { adults, children, infants } = value;
  const total = adults + children + infants;

  function setAdults(n: number) {
    const newAdults = Math.max(1, n);
    const newTotal = newAdults + children + infants;
    if (newTotal > maxTotal) return;
    if (infants > newAdults) {
      onChange({ adults: newAdults, children, infants: newAdults });
    } else {
      onChange({ adults: newAdults, children, infants });
    }
  }

  function setChildren(n: number) {
    const newChildren = Math.max(0, n);
    if (adults + newChildren + infants > maxTotal) return;
    onChange({ adults, children: newChildren, infants });
  }

  function setInfants(n: number) {
    const newInfants = Math.max(0, n);
    if (newInfants > adults) return;
    if (adults + children + newInfants > maxTotal) return;
    onChange({ adults, children, infants: newInfants });
  }

  const parts: string[] = [];
  parts.push(`${adults} Adult${adults !== 1 ? "s" : ""}`);
  if (children > 0) parts.push(`${children} Child${children !== 1 ? "ren" : ""}`);
  if (infants > 0) parts.push(`${infants} Infant${infants !== 1 ? "s" : ""}`);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-sm"
          aria-label="Select passengers"
        >
          <span className="truncate text-left">{parts.join(", ")}</span>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 text-slate-400" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          className="z-50 w-72 rounded-lg border bg-white p-4 shadow-lg outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
          sideOffset={4}
        >
          <div className="mb-2 text-sm font-semibold text-slate-900">
            Passengers
          </div>
          <div className="divide-y">
            <CounterRow
              label="Adults"
              description="12 years or older"
              value={adults}
              onIncrement={() => setAdults(adults + 1)}
              onDecrement={() => setAdults(adults - 1)}
              decrementDisabled={adults <= 1}
              incrementDisabled={total >= maxTotal}
            />
            <CounterRow
              label="Children"
              description="2–11 years"
              value={children}
              onIncrement={() => setChildren(children + 1)}
              onDecrement={() => setChildren(children - 1)}
              decrementDisabled={children <= 0}
              incrementDisabled={total >= maxTotal}
            />
            <CounterRow
              label="Infants"
              description="Under 2 years (1 per adult)"
              value={infants}
              onIncrement={() => setInfants(infants + 1)}
              onDecrement={() => setInfants(infants - 1)}
              decrementDisabled={infants <= 0}
              incrementDisabled={infants >= adults || total >= maxTotal}
            />
          </div>
          <div className="mt-3 border-t pt-3">
            <Button
              type="button"
              className="w-full"
              size="sm"
              onClick={() => setOpen(false)}
            >
              Done
            </Button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
