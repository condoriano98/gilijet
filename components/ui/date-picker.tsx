"use client";

import * as React from "react";
import { format } from "date-fns";
import { DayPicker } from "react-day-picker";
import "react-day-picker/style.css";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type DatePickerProps = {
  value: string; // ISO yyyy-MM-dd
  onChange: (value: string) => void;
  minDate?: string; // ISO yyyy-MM-dd
  placeholder?: string;
  id?: string;
};

function toDate(ymd: string): Date | undefined {
  if (!ymd) return undefined;
  const d = new Date(ymd + "T00:00:00");
  return isNaN(d.getTime()) ? undefined : d;
}

function fromDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function DatePicker({
  value,
  onChange,
  minDate,
  placeholder = "Pick a date",
  id,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const selected = toDate(value);
  const min = toDate(minDate ?? "");

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          className="flex h-10 w-full items-center rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <span className={selected ? "" : "text-slate-400"}>
            {selected ? format(selected, "dd MMM yyyy") : placeholder}
          </span>
          <svg
            className="ml-auto h-4 w-4 text-slate-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <DayPicker
          mode="single"
          selected={selected}
          onSelect={(day) => {
            if (day) {
              onChange(fromDate(day));
              setOpen(false);
            }
          }}
          disabled={min ? { before: min } : undefined}
        />
      </PopoverContent>
    </Popover>
  );
}
