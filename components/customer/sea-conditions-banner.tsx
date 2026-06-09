"use client";

import * as React from "react";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";

type SeaConditionsBannerProps = {
  conditions: {
    route: string;
    status: string;
    message: string | null;
  }[];
};

export function SeaConditionsBanner({ conditions }: SeaConditionsBannerProps) {
  const [dismissed, setDismissed] = React.useState(false);

  if (dismissed || conditions.length === 0) return null;

  const hasDanger = conditions.some((c) => c.status === "DANGEROUS");
  const hasRough = conditions.some((c) => c.status === "ROUGH");

  const variant = hasDanger
    ? "bg-red-50 border-red-200 text-red-900"
    : hasRough
      ? "bg-amber-50 border-amber-200 text-amber-900"
      : "bg-sky-50 border-sky-200 text-sky-900";

  return (
    <div className={`border-b ${variant}`}>
      <div className="container flex items-center justify-between gap-4 py-2 text-sm">
        <div className="flex items-center gap-2">
          <span className="font-semibold">Sea Conditions:</span>
          {conditions.map((c) => (
            <span key={c.route} className="flex items-center gap-1">
              {c.route}
              <Badge
                variant={
                  c.status === "DANGEROUS"
                    ? "destructive"
                    : c.status === "ROUGH"
                      ? "warning"
                      : "success"
                }
                className="text-xs"
              >
                {c.status}
              </Badge>
            </span>
          ))}
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="rounded p-1 hover:bg-black/5"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
