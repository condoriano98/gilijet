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
  defaultPassengers?: number;
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
  const [origin, setOrigin] = React.useState(
    props.defaultOrigin ?? props.origins[0] ?? "",
  );
  const [destination, setDestination] = React.useState(
    props.defaultDestination ?? props.destinations[0] ?? "",
  );
  const [date, setDate] = React.useState(props.defaultDate ?? todayLocalYmd());
  const [passengers, setPassengers] = React.useState(
    props.defaultPassengers ?? 1,
  );
  const [submitting, setSubmitting] = React.useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!origin || !destination || origin === destination || !date) return;
    setSubmitting(true);
    const params = new URLSearchParams({
      origin,
      destination,
      date,
      passengers: String(passengers),
    });
    router.push(`/search?${params.toString()}`);
  }

  return (
    <form
      onSubmit={submit}
      className="grid gap-3 rounded-xl border bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-5 lg:gap-3 lg:p-5"
    >
      <div className="space-y-1">
        <Label htmlFor="origin">From</Label>
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
        <Label htmlFor="date">Date</Label>
        <Input
          id="date"
          type="date"
          value={date}
          min={todayLocalYmd()}
          onChange={(e) => setDate(e.target.value)}
          required
        />
      </div>
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
    </form>
  );
}
