"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { MapPin, ArrowLeftRight, Search as SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Counter } from "@/components/ui/counter";

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

const FIELD =
  "h-14 rounded-[10px] border-2 border-slate-100 px-4 text-[15px]";
const LABEL = "mb-2 block text-sm font-medium text-slate-500";

export function SearchForm(props: SearchFormProps) {
  const router = useRouter();
  const [tripType, setTripType] = React.useState<"one_way" | "round_trip">(
    props.defaultTripType ?? (props.defaultReturnDate ? "round_trip" : "one_way"),
  );
  const [origin, setOrigin] = React.useState(props.defaultOrigin ?? "");
  const [destination, setDestination] = React.useState(
    props.defaultDestination ?? props.destinations[1] ?? "",
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
    // Origin is optional: empty = "any departure port", which broadens to all
    // routes ending at `destination`. Destination + date are still required.
    if (!destination || origin === destination || !date) return;
    if (tripType === "round_trip" && (!returnDate || returnDate < date)) return;
    setSubmitting(true);
    const params = new URLSearchParams({
      destination,
      date,
      passengers: String(passengers),
    });
    if (origin) params.set("origin", origin);
    if (tripType === "round_trip" && returnDate) {
      params.set("returnDate", returnDate);
    }
    router.push(`/search?${params.toString()}`);
  }

  return (
    <form onSubmit={submit} className="p-4 sm:p-6">
      {/* Trip type */}
      <div className="mb-4 inline-flex rounded-full bg-slate-100 p-1 text-sm">
        {(["one_way", "round_trip"] as const).map((tt) => (
          <button
            key={tt}
            type="button"
            onClick={() => setTripType(tt)}
            className={`rounded-full px-4 py-1.5 transition-colors ${
              tripType === tt
                ? "bg-white font-semibold text-brand shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            {tt === "one_way" ? "One way" : "Return"}
          </button>
        ))}
      </div>

      {/* From · swap · To (combined field, Figma) */}
      <div>
        <div className="mb-2 flex text-sm font-medium text-slate-500">
          <span className="flex-1">From:</span>
          <span className="w-14 shrink-0" />
          <span className="flex-1">To:</span>
        </div>
        <div className="flex items-stretch rounded-[10px] border-2 border-slate-100">
          <div className="flex flex-1 items-center gap-2 px-4">
            <MapPin size={20} className="shrink-0 text-brand" />
            <select
              aria-label="From"
              value={origin}
              onChange={(e) => setOrigin(e.target.value)}
              className="h-14 w-full bg-transparent text-[15px] outline-none"
            >
              <option value="">Any departure port</option>
              {props.origins.map((p) => (
                <option key={p} value={p} disabled={p === destination}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <div className="relative flex w-14 shrink-0 items-center justify-center">
            <button
              type="button"
              onClick={swap}
              aria-label="Swap origin and destination"
              className="flex h-11 w-11 items-center justify-center rounded-full bg-brand text-white shadow-md transition-colors hover:bg-brand-dark"
            >
              <ArrowLeftRight size={18} />
            </button>
          </div>
          <div className="flex flex-1 items-center gap-2 px-4">
            <MapPin size={20} className="shrink-0 text-brand" />
            <select
              aria-label="To"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              className="h-14 w-full bg-transparent text-[15px] outline-none"
            >
              <option value="" disabled>
                Pick a destination
              </option>
              {props.destinations.map((p) => (
                <option key={p} value={p} disabled={p === origin}>
                  {p}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Departure · Passengers (+ Return) */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="date" className={LABEL}>
            Departure:
          </label>
          <DatePicker
            id="date"
            value={date}
            onChange={setDate}
            minDate={todayLocalYmd()}
            className={FIELD}
          />
        </div>
        {tripType === "round_trip" ? (
          <div>
            <label htmlFor="returnDate" className={LABEL}>
              Return:
            </label>
            <DatePicker
              id="returnDate"
              value={returnDate}
              onChange={setReturnDate}
              minDate={date || todayLocalYmd()}
              className={FIELD}
            />
          </div>
        ) : null}
        <div>
          <label htmlFor="passengers" className={LABEL}>
            Passengers:
          </label>
          <Counter
            id="passengers"
            value={passengers}
            onChange={setPassengers}
            min={1}
            max={10}
            className="h-14 rounded-[10px] border-2 border-slate-100"
          />
        </div>
      </div>

      <Button
        type="submit"
        disabled={submitting || origin === destination}
        className="mt-5 h-14 w-full rounded-pill bg-brand text-base font-semibold text-white hover:bg-brand-dark"
      >
        <SearchIcon size={18} className="mr-2" />
        {submitting ? "Searching…" : "Search"}
      </Button>
    </form>
  );
}
