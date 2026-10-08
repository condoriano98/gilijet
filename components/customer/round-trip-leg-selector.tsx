'use client';

import * as React from 'react';
import Link from 'next/link';
import type { Prisma } from '@prisma/client';
import { formatLocalTime, formatLocalDate } from '@/lib/datetime';
import { formatIDR } from '@/lib/utils';
import { formatWithDisplay } from '@/lib/fx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

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
        className={`w-full text-left transition-all ${
          isSelected ? 'ring-2 ring-brand' : 'hover:shadow-md'
        }`}
      >
        <Card className={isSelected ? 'border-brand' : ''}>
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                {leg.schedule.boat.photos.length > 0 ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={leg.schedule.boat.photos[0]}
                    alt={leg.schedule.boat.name}
                    className="hidden h-16 w-20 shrink-0 rounded-md border object-cover sm:block"
                  />
                ) : null}
                <div>
                  <CardTitle className="text-2xl">
                    {formatLocalTime(leg.departureDate)}
                  </CardTitle>
                  <CardDescription>
                    {leg.schedule.boat.name} · {leg.schedule.durationMinutes} min
                    {rating && rating.count > 0 ? (
                      <>
                        {' '}· <span className="text-amber-600">★ {rating.avg.toFixed(1)}</span>{' '}
                        <span className="text-muted-foreground">
                          ({rating.count} review{rating.count === 1 ? '' : 's'})
                        </span>
                      </>
                    ) : null}
                  </CardDescription>
                </div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold">
                  {fxDisplay.primary}
                </div>
                {fxDisplay.secondary ? (
                  <div className="text-xs text-slate-500">{fxDisplay.secondary}</div>
                ) : null}
                <div className="text-xs text-muted-foreground">
                  per passenger
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="success">Direct · {leg.schedule.durationMinutes}m</Badge>
              <Badge variant="outline">{leg.schedule.boat.category}</Badge>
              <Badge variant="outline">{leg.schedule.boat.operator.companyName}</Badge>
              {isSelected && <Badge className="bg-brand text-white">Selected</Badge>}
            </div>
          </CardContent>
        </Card>
      </button>
    );
  };

  return (
    <div className="space-y-6">
      {/* Outbound legs */}
      <div>
        <h2 className="mb-3 text-lg font-semibold">Outbound</h2>
        {outboundLegs.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              No departures available
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
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
        <h2 className="mb-3 text-lg font-semibold">Return</h2>
        {returnLegs.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              No departures available
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
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
        <div className="sticky bottom-0 bg-white p-4 shadow-lg rounded-t-lg">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Total for {passengers} passenger{passengers === 1 ? '' : 's'}</p>
              <p className="text-2xl font-bold">{formatIDR(totalPrice)}</p>
            </div>
            <Button asChild size="lg">
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
