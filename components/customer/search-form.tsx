"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { ArrowLeftRight, Search as SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Counter } from "@/components/ui/counter";
import { GroupedPortSelect } from "@/components/ui/grouped-port-select";
import type { PortsByRegion } from "@/lib/home-data";

export type SearchFormProps = {
  origins: string[];
  destinations: string[];
  portsByRegion: PortsByRegion;
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
  const [isPending, startTransition] = useTransition();
  const [tripType, setTripType] = React.useState<"one_way" | "round_trip">(
    props.defaultTripType ?? (props.defaultReturnDate ? "round_trip" : "one_way"),
  );
  const [origin, setOrigin] = React.useState(props.defaultOrigin ?? "");
  const [destination, setDestination] = React.useState(
    props.defaultDestination ?? "",
  );
  const [date, setDate] = React.useState(props.defaultDate ?? todayLocalYmd());
  const [returnDate, setReturnDate] = React.useState(
    props.defaultReturnDate ?? "",
  );
  const [passengers, setPassengers] = React.useState(
    props.defaultPassengers ?? 1,
  );

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
    const params = new URLSearchParams({
      destination,
      date,
      passengers: String(passengers),
    });
    if (origin) params.set("origin", origin);
    if (tripType === "round_trip" && returnDate) {
      params.set("returnDate", returnDate);
    }
    startTransition(() => {
      router.push(`/search?${params.toString()}`);
    });
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

      {/* From · swap · To */}
      <div>
        <div className="mb-2 hidden text-sm font-medium text-slate-500 sm:flex">
          <span className="flex-1">From:</span>
          <span className="w-14 shrink-0" />
          <span className="flex-1">To:</span>
        </div>
        <div className="flex flex-col gap-3 sm:gap-0 sm:flex-row sm:items-center">
          <div className="flex-1">
            <span className="mb-1.5 block text-sm font-medium text-slate-500 sm:hidden">
              From:
            </span>
            <GroupedPortSelect
              ports={props.portsByRegion}
              value={origin}
              onValueChange={setOrigin}
              placeholder="Any departure port"
              disabledValue={destination}
              className="sm:rounded-r-none sm:border-r-0"
            />
          </div>
          <div className="relative flex shrink-0 items-center justify-center sm:w-14 sm:-mx-1 sm:z-10">
            <button
              type="button"
              onClick={swap}
              aria-label="Swap origin and destination"
              className="flex h-11 w-11 rotate-90 items-center justify-center rounded-full bg-brand text-white shadow-md transition-colors hover:bg-brand-dark sm:rotate-0"
            >
              <ArrowLeftRight size={18} />
            </button>
          </div>
          <div className="flex-1">
            <span className="mb-1.5 block text-sm font-medium text-slate-500 sm:hidden">
              To:
            </span>
            <GroupedPortSelect
              ports={props.portsByRegion}
              value={destination}
              onValueChange={setDestination}
              placeholder="Pick a destination"
              disabledValue={origin}
              className="sm:rounded-l-none sm:border-l-0"
            />
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
        disabled={isPending || origin === destination}
        className="mt-5 h-14 w-full rounded-pill bg-brand text-base font-semibold text-white hover:bg-brand-dark"
      >
        <SearchIcon size={18} className="mr-2" />
        {isPending ? "Searching…" : "Search"}
      </Button>
    </form>
  );
}
