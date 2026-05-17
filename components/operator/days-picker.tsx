"use client";

import * as React from "react";
import { Checkbox } from "@/components/ui/checkbox";

const DAYS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 7, label: "Sun" },
];

/**
 * Days-of-week picker. Renders an inline group of 7 checkboxes and emits
 * the selection through a hidden `daysOfWeek` input so it ships back with
 * a plain <form>.
 */
export function DaysOfWeekPicker({
  defaultValue = [],
  name = "daysOfWeek",
}: {
  defaultValue?: number[];
  name?: string;
}) {
  const [selected, setSelected] = React.useState<Set<number>>(
    () => new Set(defaultValue),
  );
  const toggle = (v: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      return next;
    });
  };
  const csv = Array.from(selected).sort((a, b) => a - b).join(",");

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-3">
        {DAYS.map((d) => {
          const id = `dow-${d.value}`;
          const checked = selected.has(d.value);
          return (
            <label
              key={d.value}
              htmlFor={id}
              className="flex cursor-pointer items-center gap-2 rounded-md border border-input px-3 py-2 text-sm hover:bg-accent"
            >
              <Checkbox
                id={id}
                checked={checked}
                onCheckedChange={() => toggle(d.value)}
              />
              <span>{d.label}</span>
            </label>
          );
        })}
      </div>
      <input type="hidden" name={name} value={csv} />
    </div>
  );
}
