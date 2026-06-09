"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

export type SearchFormProps = {
  origins: string[];
  destinations: string[];
  defaultOrigin?: string;
  defaultDestination?: string;
  defaultDate?: string;
  defaultReturnDate?: string;
  defaultPassengers?: number;
  defaultTripType?: "one_way" | "round_trip";
};

function todayLocalYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function SearchForm(props: SearchFormProps) {
  const router = useRouter();
  const [tripType, setTripType] = React.useState<"one_way" | "round_trip">(
    props.defaultTripType ?? (props.defaultReturnDate ? "round_trip" : "one_way"),
  );
  const [origin, setOrigin] = React.useState(
    props.defaultOrigin ?? props.origins[0] ?? "",
  );
  const [destination, setDestination] = React.useState(
    props.defaultDestination ?? props.destinations[0] ?? "",
  );
  const [date, setDate] = React.useState(props.defaultDate ?? todayLocalYmd());
  const [returnDate, setReturnDate] = React.useState(
    props.defaultReturnDate ?? "",
  );
  const [passengers, setPassengers] = React.useState(
    props.defaultPassengers ?? 1,
  );
  const [submitting, setSubmitting] = React.useState(false);

  function swap() {
    setOrigin(destination);
    setDestination(origin);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!origin || !destination || origin === destination || !date) return;
    if (tripType === "round_trip" && (!returnDate || returnDate < date)) return;
    setSubmitting(true);
    const params = new URLSearchParams({
      origin,
      destination,
      date,
      passengers: String(passengers),
    });
    if (tripType === "round_trip" && returnDate) {
      params.set("returnDate", returnDate);
    }
    router.push(`/search?${params.toString()}`);
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-xl border bg-white p-4 shadow-sm lg:p-5"
    >
      {/* Trip type tabs */}
      <div className="mb-3 inline-flex rounded-md border bg-slate-50 p-0.5 text-sm">
        <button
          type="button"
          onClick={() => setTripType("one_way")}
          className={`rounded px-3 py-1.5 transition-colors ${
            tripType === "one_way"
              ? "bg-white shadow-sm font-medium text-sky-700"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          One way
        </button>
        <button
          type="button"
          onClick={() => setTripType("round_trip")}
          className={`rounded px-3 py-1.5 transition-colors ${
            tripType === "round_trip"
              ? "bg-white shadow-sm font-medium text-sky-700"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          Return
        </button>
      </div>

      <div
        className={`grid gap-3 ${
          tripType === "round_trip"
            ? "sm:grid-cols-2 lg:grid-cols-6"
            : "sm:grid-cols-2 lg:grid-cols-5"
        }`}
      >
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <Label htmlFor="origin">From</Label>
            <button
              type="button"
              onClick={swap}
              className="text-xs text-sky-700 hover:underline"
              aria-label="Swap origin and destination"
            >
              ⇄ Swap
            </button>
          </div>
          <select
            id="origin"
            value={origin}
            onChange={(e) => setOrigin(e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {props.origins.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="destination">To</Label>
          <select
            id="destination"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {props.destinations.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="date">Departure</Label>
          <Input
            id="date"
            type="date"
            value={date}
            min={todayLocalYmd()}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </div>
        {tripType === "round_trip" ? (
          <div className="space-y-1">
            <Label htmlFor="returnDate">Return</Label>
            <Input
              id="returnDate"
              type="date"
              value={returnDate}
              min={date || todayLocalYmd()}
              onChange={(e) => setReturnDate(e.target.value)}
              required
            />
          </div>
        ) : null}
        <div className="space-y-1">
          <Label htmlFor="passengers">Passengers</Label>
          <Input
            id="passengers"
            type="number"
            min={1}
            max={10}
            value={passengers}
            onChange={(e) =>
              setPassengers(Math.max(1, Math.min(10, Number(e.target.value))))
            }
          />
        </div>
        <div className="flex items-end">
          <Button
            type="submit"
            className="w-full"
            disabled={submitting || origin === destination}
          >
            {submitting ? "Searching…" : "Search"}
          </Button>
        </div>
      </div>
    </form>
  );
}
