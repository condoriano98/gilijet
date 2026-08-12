"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { nearestPorts, type NearestPortResult } from "@/lib/geo";

export function NearestPortCard() {
  const [ports, setPorts] = useState<NearestPortResult[] | null>(null);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPorts(nearestPorts(pos.coords.latitude, pos.coords.longitude, 3));
      },
      () => setDenied(true),
      { timeout: 5000 },
    );
  }, []);

  if (denied || ports === null) return null;

  const nearest = ports[0];
  if (!nearest || nearest.distanceKm > 200) return null;

  return (
    <Card className="border-gilifast-ocean/30 bg-gradient-to-r from-gilifast-foam to-white">
      <CardContent className="flex flex-col gap-4 pt-5 pb-5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gilifast-ocean">
            Nearest to you
          </p>
          <p className="mt-1 text-lg font-display font-bold text-slate-900">
            {nearest.name}
          </p>
          <p className="text-sm text-slate-500">
            ~{Math.round(nearest.distanceKm)} km away
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Button asChild size="sm" className="w-full sm:w-auto">
            <Link
              href={`/search?origin=${encodeURIComponent(nearest.name)}`}
            >
              Search from here
            </Link>
          </Button>
          {ports.length > 1 && (
            <Button asChild variant="outline" size="sm" className="w-full sm:w-auto">
              <Link
                href={`/search?origin=${encodeURIComponent(ports[1].name)}`}
              >
                {ports[1].name} ({Math.round(ports[1].distanceKm)} km)
              </Link>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
