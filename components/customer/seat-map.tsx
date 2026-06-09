"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export type SeatLayout = {
  rows: {
    id: string;
    label: string;
    seats: {
      id: string;
      label: string;
      type: "STANDARD" | "VIP" | "ECONOMY";
    }[];
  }[];
};

type SeatMapProps = {
  layout: SeatLayout;
  occupiedSeats: string[];
  lockedSeats: string[];
  selectedSeats: string[];
  onSeatToggle: (seatId: string) => void;
};

export function SeatMap({
  layout,
  occupiedSeats,
  lockedSeats,
  selectedSeats,
  onSeatToggle,
}: SeatMapProps) {
  function getSeatState(seatId: string) {
    if (occupiedSeats.includes(seatId)) return "occupied";
    if (lockedSeats.includes(seatId)) return "locked";
    if (selectedSeats.includes(seatId)) return "selected";
    return "available";
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-center gap-4 text-xs">
        <div className="flex items-center gap-1">
          <div className="h-4 w-4 rounded border bg-sky-100 border-sky-300" />
          <span>Available</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="h-4 w-4 rounded border bg-sky-600 border-sky-700" />
          <span>Selected</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="h-4 w-4 rounded border bg-slate-300 border-slate-400" />
          <span>Occupied</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="h-4 w-4 rounded border bg-amber-200 border-amber-400" />
          <span>Locked</span>
        </div>
      </div>

      <div className="mx-auto max-w-md rounded-lg border bg-slate-50 p-4">
        <div className="mb-4 text-center text-xs font-semibold text-slate-500 uppercase">
          Front
        </div>
        <div className="space-y-2">
          {layout.rows.map((row) => (
            <div key={row.id} className="flex items-center justify-center gap-2">
              <span className="w-6 text-xs font-semibold text-slate-500">
                {row.label}
              </span>
              <div className="flex gap-1">
                {row.seats.map((seat) => {
                  const state = getSeatState(seat.id);
                  return (
                    <button
                      key={seat.id}
                      type="button"
                      disabled={state === "occupied" || state === "locked"}
                      onClick={() => onSeatToggle(seat.id)}
                      className={cn(
                        "h-8 w-8 rounded border text-xs font-semibold transition-colors",
                        state === "available" &&
                          "bg-sky-100 border-sky-300 hover:bg-sky-200 cursor-pointer",
                        state === "selected" &&
                          "bg-sky-600 border-sky-700 text-white",
                        state === "occupied" &&
                          "bg-slate-300 border-slate-400 text-slate-500 cursor-not-allowed",
                        state === "locked" &&
                          "bg-amber-200 border-amber-400 text-amber-700 cursor-not-allowed",
                        seat.type === "VIP" && state === "available" && "ring-2 ring-amber-400",
                      )}
                      title={`${seat.label} (${seat.type})`}
                    >
                      {seat.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 text-center text-xs font-semibold text-slate-500 uppercase">
          Rear
        </div>
      </div>
    </div>
  );
}
