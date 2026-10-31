'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/shared/ui/card';
import type { DepartingSoon } from '@/features/schedules/home-data';

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
      <div className="mb-7 flex items-end justify-between">
        <div>
          <h2 className="text-2xl font-display font-extrabold tracking-tight text-brand-ink sm:text-[34px]">
            Departing soon
          </h2>
          <p className="mt-1.5 text-base text-brand-muted">
            Boats leaving in the next 6 hours
          </p>
        </div>
        <Link
          href="/search"
          className="hidden text-[15px] font-semibold text-brand hover:underline sm:inline"
        >
          See all →
        </Link>
      </div>

      <div className="-mx-5 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-5 sm:overflow-visible sm:px-0 lg:grid-cols-3">
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
      ? 'bg-rose-50 text-rose-700 ring-1 ring-rose-200'
      : minutesAway < 180
        ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'
        : 'bg-brand-periwinkle text-brand-dark';

  return (
    <Link
      href={`/book/${departure.legId}`}
      className="group w-72 flex-shrink-0 snap-start sm:w-auto"
    >
      <Card className="h-full rounded-3xl border-brand-line bg-white p-6 shadow-none transition-all hover:-translate-y-0.5 hover:shadow-ambient">
        <div
          className={`inline-flex items-center rounded-full px-3 py-1 text-[13px] font-semibold ${urgency}`}
        >
          Leaves in {formatRelative(minutesAway)}
        </div>
        <div className="mt-4 text-xl font-bold tracking-tight text-brand-ink">
          {departure.origin} → {departure.destination}
        </div>
        <div className="mt-1 truncate text-sm text-brand-muted">
          {departure.operatorName} · {departure.boatName}
        </div>
        <div className="mt-6 flex items-baseline justify-between">
          <div>
            <span className="text-[13px] text-brand-muted">from </span>
            <span className="text-[22px] font-extrabold text-brand">
              IDR {departure.priceIDR.toLocaleString('id-ID')}
            </span>
          </div>
          <span className="text-sm font-semibold text-brand group-hover:underline">
            Book →
          </span>
        </div>
      </Card>
    </Link>
  );
}

function formatRelative(minutes: number): string {
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}
