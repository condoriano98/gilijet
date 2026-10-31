'use client';

import * as React from 'react';
import Link from 'next/link';
import type { Prisma } from '@prisma/client';
import { formatLocalTime, formatLocalDate } from '@/shared/lib/datetime';
import { formatIDR } from '@/shared/lib/utils';
import { formatWithDisplay } from '@/features/pricing/fx';
import { Card, CardContent } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';

// Leg with all Decimals converted to numbers (via serializeDecimals)
type LegForClient = any; // Serialized from Prisma Leg type

interface RoundTripLegSelectorProps {
  outboundLegs: LegForClient[];
  returnLegs: LegForClient[];
  passengers: number;
  ratingsByScheduleId: Record<string, { avg: number; count: number }>;
  fxRates: Map<string, number>;
}

export function RoundTripLegSelector({
  outboundLegs,
  returnLegs,
  passengers,
  ratingsByScheduleId,
  fxRates,
}: RoundTripLegSelectorProps) {
  const [selectedOutbound, setSelectedOutbound] = React.useState<string | null>(null);
  const [selectedReturn, setSelectedReturn] = React.useState<string | null>(null);

  const outboundLeg = outboundLegs.find((l) => l.id === selectedOutbound);
  const returnLeg = returnLegs.find((l) => l.id === selectedReturn);

  const totalPrice = outboundLeg && returnLeg
    ? (Number(outboundLeg.basePrice) + Number(returnLeg.basePrice)) * passengers
    : 0;

  const bookingUrl = selectedOutbound && selectedReturn
    ? `/book/0?outboundLegId=${selectedOutbound}&returnLegId=${selectedReturn}&passengers=${passengers}`
    : null;

  const LegCard = ({ leg, isSelected, onSelect }: {
    leg: LegForClient;
    isSelected: boolean;
    onSelect: () => void;
  }) => {
    const rating = ratingsByScheduleId[leg.scheduleId];
    const priceIdr = Number(leg.basePrice);
    const fxDisplay = formatWithDisplay(priceIdr, 'USD', fxRates);

    return (
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={isSelected}
        className={`flex w-full flex-col gap-3 rounded-[22px] border bg-white p-4 text-left transition-all sm:flex-row sm:items-center sm:justify-between sm:gap-5 sm:p-[18px] ${
          isSelected
            ? 'border-brand ring-2 ring-brand'
            : 'border-brand-line hover:border-brand/40 hover:shadow-ambient-sm'
        }`}
      >
        <div className="flex min-w-0 items-start gap-4">
          {leg.schedule.boat.photos.length > 0 ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={leg.schedule.boat.photos[0]}
              alt={leg.schedule.boat.name}
              className="hidden h-16 w-20 shrink-0 rounded-2xl border border-brand-line object-cover sm:block"
            />
          ) : null}
          <div className="min-w-0">
            <div className="text-[26px] font-extrabold leading-tight tracking-tight tabular-nums text-brand-ink">
              {formatLocalTime(leg.departureDate)}
            </div>
            <div className="mt-1 text-sm text-brand-muted">
              {leg.schedule.boat.name} · {leg.schedule.durationMinutes} min
              {rating && rating.count > 0 ? (
                <>
                  {' '}· <span className="font-bold text-amber-700">★ {rating.avg.toFixed(1)}</span>{' '}
                  <span>
                    ({rating.count} review{rating.count === 1 ? '' : 's'})
                  </span>
                </>
              ) : null}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold">
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-800">
                Direct · {leg.schedule.durationMinutes}m
              </span>
              <span className="rounded-full bg-brand-periwinkle px-3 py-1 text-brand-dark">
                {leg.schedule.boat.category}
              </span>
              <span className="rounded-full border border-brand-line px-3 py-1 text-brand-text">
                {leg.schedule.boat.operator.companyName}
              </span>
              {isSelected && (
                <span className="rounded-full bg-brand px-3 py-1 text-white">Selected</span>
              )}
            </div>
          </div>
        </div>
        <div className="sm:text-right">
          <div className="text-2xl font-extrabold tracking-tight text-brand">
            {fxDisplay.primary}
          </div>
          {fxDisplay.secondary ? (
            <div className="text-xs text-brand-muted">{fxDisplay.secondary}</div>
          ) : null}
          <div className="text-[13px] text-brand-muted">per passenger</div>
        </div>
      </button>
    );
  };

  return (
    <div className="space-y-6">
      {/* Outbound legs */}
      <div>
        <h2 className="mb-4 font-display text-xl font-extrabold tracking-tight text-brand-ink">Outbound</h2>
        {outboundLegs.length === 0 ? (
          <Card className="rounded-3xl border-brand-line shadow-none">
            <CardContent className="py-12 text-center text-sm text-brand-muted">
              No departures available
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {outboundLegs.map((leg) => (
              <LegCard
                key={leg.id}
                leg={leg}
                isSelected={selectedOutbound === leg.id}
                onSelect={() => setSelectedOutbound(leg.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Return legs */}
      <div>
        <h2 className="mb-4 font-display text-xl font-extrabold tracking-tight text-brand-ink">Return</h2>
        {returnLegs.length === 0 ? (
          <Card className="rounded-3xl border-brand-line shadow-none">
            <CardContent className="py-12 text-center text-sm text-brand-muted">
              No departures available
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {returnLegs.map((leg) => (
              <LegCard
                key={leg.id}
                leg={leg}
                isSelected={selectedReturn === leg.id}
                onSelect={() => setSelectedReturn(leg.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Summary & CTA */}
      {selectedOutbound && selectedReturn && (
        <div className="sticky bottom-0 rounded-t-3xl border border-brand-line bg-white p-4 shadow-ambient sm:p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm text-brand-muted">Total for {passengers} passenger{passengers === 1 ? '' : 's'}</p>
              <p className="text-2xl font-extrabold text-brand">{formatIDR(totalPrice)}</p>
            </div>
            <Button asChild size="lg" className="rounded-[14px] bg-brand font-bold text-white hover:bg-brand-dark">
              <Link href={bookingUrl!}>
                Continue to Booking
              </Link>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
