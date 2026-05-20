"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";

export type SeatInfo = {
  label: string;
  row: number;
  col: number;
  status: "AVAILABLE" | "BOOKED" | "HELD" | "BLOCKED";
};

type Props = {
  seats: SeatInfo[];
  rows: number;
  cols: number;
  maxSelect: number;
  name?: string; // hidden input name, defaults to "selectedSeat"
};

export function SeatPicker({ seats, rows, cols, maxSelect, name = "selectedSeat" }: Props) {
  const [selected, setSelected] = useState<string[]>([]);

  const seatMap = new Map(seats.map((s) => [`${s.row}-${s.col}`, s]));

  function toggle(label: string) {
    setSelected((prev) => {
      if (prev.includes(label)) return prev.filter((s) => s !== label);
      if (prev.length >= maxSelect) return prev; // at capacity
      return [...prev, label];
    });
  }

  const COL_LABELS = ["A", "B", "C", "D", "E", "F"];

  return (
    <div className="space-y-3">
      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="inline-block h-4 w-4 rounded border border-sky-500 bg-sky-100" />
          Available
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-4 w-4 rounded border border-sky-600 bg-sky-600" />
          Selected
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-4 w-4 rounded border border-slate-300 bg-slate-200" />
          Taken
        </span>
      </div>

      {/* Grid */}
      <div className="overflow-x-auto">
        <div className="inline-block min-w-fit">
          {/* Column headers */}
          <div
            className="mb-1 grid gap-1 text-center text-xs font-medium text-muted-foreground"
            style={{
              gridTemplateColumns: `1.5rem repeat(${cols}, 2.25rem)`,
            }}
          >
            <div />
            {Array.from({ length: cols }).map((_, c) => (
              <div key={c}>{COL_LABELS[c] ?? c + 1}</div>
            ))}
          </div>

          {/* Rows */}
          {Array.from({ length: rows }).map((_, r) => (
            <div
              key={r}
              className="mb-1 grid items-center gap-1"
              style={{
                gridTemplateColumns: `1.5rem repeat(${cols}, 2.25rem)`,
              }}
            >
              <div className="text-center text-xs text-muted-foreground">{r + 1}</div>
              {Array.from({ length: cols }).map((_, c) => {
                const seat = seatMap.get(`${r}-${c}`);
                if (!seat) {
                  // Empty cell (aisle or no seat)
                  return <div key={c} className="h-9 w-9" />;
                }
                const isSelected = selected.includes(seat.label);
                const isTaken = seat.status === "BOOKED" || seat.status === "HELD" || seat.status === "BLOCKED";
                const isDisabled = isTaken || (!isSelected && selected.length >= maxSelect);

                return (
                  <button
                    key={c}
                    type="button"
                    title={seat.label}
                    disabled={isDisabled}
                    onClick={() => !isTaken && toggle(seat.label)}
                    className={[
                      "flex h-9 w-9 items-center justify-center rounded text-xs font-medium transition-colors",
                      isTaken
                        ? "cursor-not-allowed border border-slate-300 bg-slate-200 text-slate-400"
                        : isSelected
                          ? "border border-sky-600 bg-sky-600 text-white"
                          : isDisabled
                            ? "cursor-not-allowed border border-sky-200 bg-sky-50 text-sky-300"
                            : "cursor-pointer border border-sky-400 bg-sky-50 text-sky-700 hover:bg-sky-100",
                    ].join(" ")}
                  >
                    {seat.label}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Selection summary + hidden inputs */}
      <div className="flex flex-wrap items-center gap-2">
        {selected.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Select {maxSelect} seat{maxSelect !== 1 ? "s" : ""}
          </p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">Selected:</p>
            {selected.map((s) => (
              <Badge key={s} variant="outline" className="font-mono">
                {s}
              </Badge>
            ))}
            {selected.length < maxSelect && (
              <p className="text-xs text-amber-600">
                {maxSelect - selected.length} more needed
              </p>
            )}
          </>
        )}
      </div>

      {/* Hidden inputs for form submission */}
      {selected.map((s) => (
        <input key={s} type="hidden" name={name} value={s} />
      ))}
    </div>
  );
}
