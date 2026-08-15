"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import type { DepartingSoon } from "@/lib/home-data";

export function DepartingToday({
  departures,
}: {
  departures: DepartingSoon[];
}) {
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  if (departures.length === 0) return null;

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-4 flex items-end justify-between">
        <div>
          <h2 className="text-xl font-display font-bold text-slate-900 sm:text-2xl">
            Departing soon
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Boats leaving in the next 6 hours
          </p>
        </div>
        <Link
          href="/search"
          className="hidden text-sm font-medium text-gilifast-deep hover:underline sm:inline"
        >
          See all →
        </Link>
      </div>

      <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
        {departures.map((d) => (
          <DepartureCard key={d.legId} departure={d} now={now} />
        ))}
      </div>
    </div>
  );
}

function DepartureCard({
  departure,
  now,
}: {
  departure: DepartingSoon;
  now: number;
}) {
  const departureMs = new Date(departure.departureUtc).getTime();
  const minutesAway = Math.max(0, Math.round((departureMs - now) / 60_000));

  const urgency =
    minutesAway < 60
      ? "bg-rose-50 text-rose-700 ring-1 ring-rose-200"
      : minutesAway < 180
        ? "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
        : "bg-gilifast-foam text-gilifast-deep ring-1 ring-gilifast-ocean/30";

  return (
    <Link
      href={`/book/${departure.legId}`}
      className="group w-72 flex-shrink-0 snap-start"
    >
      <Card className="h-full p-4 transition-all hover:-translate-y-0.5 hover:shadow-lg">
        <div
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${urgency}`}
        >
          Leaves in {formatRelative(minutesAway)}
        </div>
        <div className="mt-3 text-sm font-semibold text-slate-900">
          {departure.origin} → {departure.destination}
        </div>
        <div className="mt-0.5 truncate text-xs text-slate-500">
          {departure.operatorName} · {departure.boatName}
        </div>
        <div className="mt-3 flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-500">from </span>
            <span className="text-base font-bold text-gilifast-deep">
              IDR {departure.priceIDR.toLocaleString("id-ID")}
            </span>
          </div>
          <span className="text-xs font-semibold text-gilifast-deep group-hover:underline">
            Book →
          </span>
        </div>
      </Card>
    </Link>
  );
}

function formatRelative(minutes: number): string {
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}
