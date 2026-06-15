"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Minus, Plus } from "lucide-react";

export type CounterProps = {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  id?: string;
  className?: string;
};

const Counter = React.forwardRef<HTMLDivElement, CounterProps>(
  ({ value, onChange, min = 1, max = 10, id, className }, ref) => {
    const dec = () => onChange(Math.max(min, value - 1));
    const inc = () => onChange(Math.min(max, value + 1));

    return (
      <div
        ref={ref}
        id={id}
        className={cn(
          "flex h-10 w-full items-center rounded-md border border-input bg-background",
          className,
        )}
      >
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-full w-10 rounded-none rounded-l-md"
          disabled={value <= min}
          onClick={dec}
          aria-label="Decrease passengers"
        >
          <Minus className="h-4 w-4" />
        </Button>
        <span className="flex-1 text-center text-sm font-medium tabular-nums select-none">
          {value}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-full w-10 rounded-none rounded-r-md"
          disabled={value >= max}
          onClick={inc}
          aria-label="Increase passengers"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    );
  },
);
Counter.displayName = "Counter";

export { Counter };
