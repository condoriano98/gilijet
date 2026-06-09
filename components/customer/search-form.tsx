"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { PortCombobox } from "@/components/customer/port-combobox";
import {
  PassengerSelector,
  type PassengerCounts,
} from "@/components/customer/passenger-selector";
import { ArrowUpDown } from "lucide-react";

export type SearchFormProps = {
  origins: string[];
  destinations: string[];
  defaultOrigin?: string;
  defaultDestination?: string;
  defaultDate?: string;
  defaultReturnDate?: string;
  defaultPassengers?: number;
  defaultTripType?: "one_way" | "round_trip";
  defaultAdults?: number;
  defaultChildren?: number;
  defaultInfants?: number;
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
  const [passengers, setPassengers] = React.useState<PassengerCounts>({
    adults: props.defaultAdults ?? props.defaultPassengers ?? 1,
    children: props.defaultChildren ?? 0,
    infants: props.defaultInfants ?? 0,
  });
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
    const totalPassengers =
      passengers.adults + passengers.children + passengers.infants;
    const params = new URLSearchParams({
      origin,
      destination,
      date,
      passengers: String(totalPassengers),
      adults: String(passengers.adults),
      children: String(passengers.children),
      infants: String(passengers.infants),
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

      <div className="mb-3">
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Where
        </div>
        <div
          className={`grid gap-3 ${
            tripType === "round_trip" ? "sm:grid-cols-2" : "sm:grid-cols-2"
          }`}
        >
          <div className="space-y-1">
            <Label htmlFor="origin">From</Label>
            <PortCombobox
              value={origin}
              onValueChange={setOrigin}
              placeholder="Select origin..."
              excludePort={destination}
            />
          </div>
          <div className="relative space-y-1">
            <Label htmlFor="destination">To</Label>
            <PortCombobox
              value={destination}
              onValueChange={setDestination}
              placeholder="Select destination..."
              excludePort={origin}
            />
            <button
              type="button"
              onClick={swap}
              className="absolute -top-2 left-1/2 z-10 hidden -translate-x-1/2 items-center justify-center rounded-full border bg-white p-1.5 shadow-sm transition-colors hover:bg-sky-50 sm:-top-3 sm:flex sm:h-8 sm:w-8"
              aria-label="Swap origin and destination"
            >
              <ArrowUpDown className="h-3.5 w-3.5 text-sky-700" />
            </button>
          </div>
        </div>
      </div>

      <div className="mb-3">
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
          When
        </div>
        <div
          className={`grid gap-3 ${
            tripType === "round_trip" ? "sm:grid-cols-2" : "sm:grid-cols-1"
          }`}
        >
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
        </div>
      </div>

      <div className="mb-4">
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Who
        </div>
        <div className="space-y-1">
          <Label>Passengers</Label>
          <PassengerSelector value={passengers} onChange={setPassengers} />
        </div>
      </div>

      <Button
        type="submit"
        className="w-full"
        disabled={submitting || origin === destination}
      >
        {submitting ? "Searching..." : "Search"}
      </Button>
    </form>
  );
}
