'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import { Button } from '@/shared/ui/button';
import { Label } from '@/shared/ui/label';
import { Input } from '@/shared/ui/input';
import { Badge } from '@/shared/ui/badge';

type SortBy = 'time' | 'price' | 'duration';
type TimeSlot = 'any' | 'morning' | 'afternoon' | 'evening';

const SORT_OPTIONS: { value: SortBy; label: string }[] = [
  { value: 'time', label: 'Departure time' },
  { value: 'price', label: 'Price (low to high)' },
  { value: 'duration', label: 'Duration (shortest)' },
];

const TIME_OPTIONS: { value: TimeSlot; label: string; hint: string }[] = [
  { value: 'any', label: 'Any time', hint: '' },
  { value: 'morning', label: 'Morning', hint: '6am-12pm' },
  { value: 'afternoon', label: 'Afternoon', hint: '12pm-5pm' },
  { value: 'evening', label: 'Evening', hint: '5pm-12am' },
];

export function SearchFilters({
  sortBy,
  timeSlot,
  maxPrice,
}: {
  sortBy: SortBy;
  timeSlot: TimeSlot;
  maxPrice: number | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [priceInput, setPriceInput] = React.useState(
    maxPrice ? String(maxPrice) : '',
  );
  const [isPending, startTransition] = useTransition();

  function pushParam(updates: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === '') {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }
    startTransition(() => {
      router.push(`/search?${params.toString()}`);
    });
  }

  function applyPriceFilter() {
    const n = Number(priceInput);
    pushParam({ maxPrice: n > 0 ? String(n) : null });
  }

  function clearAll() {
    setPriceInput('');
    pushParam({ sortBy: null, timeSlot: null, maxPrice: null });
  }

  const activeCount =
    (sortBy !== 'time' ? 1 : 0) +
    (timeSlot !== 'any' ? 1 : 0) +
    (maxPrice ? 1 : 0);

  return (
    <div className="rounded-[22px] border border-brand-line bg-white p-5 lg:p-[22px]">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-bold text-brand-ink">Filters</h3>
          {activeCount > 0 ? (
            <Badge variant="secondary">{activeCount} active</Badge>
          ) : null}
        </div>
        {activeCount > 0 ? (
          <button
            type="button"
            onClick={clearAll}
            className="inline-flex min-h-11 items-center text-sm font-semibold text-brand hover:underline"
          >
            Clear all
          </button>
        ) : null}
      </div>

      <div className="grid gap-6 sm:grid-cols-3 lg:grid-cols-1">
        <div className="space-y-2">
          <Label className="text-sm font-bold text-brand-ink">
            Sort by
          </Label>
          <div className="space-y-2">
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() =>
                  pushParam({ sortBy: opt.value === 'time' ? null : opt.value })
                }
                className={`block min-h-11 w-full rounded-[14px] border px-3.5 py-2.5 text-left text-sm font-semibold transition-colors ${
                  sortBy === opt.value
                    ? 'border-brand bg-brand-periwinkle text-brand-dark'
                    : 'border-brand-line text-brand-text hover:border-brand/40'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-bold text-brand-ink">
            Departure time
          </Label>
          <div className="grid grid-cols-2 gap-2">
            {TIME_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() =>
                  pushParam({
                    timeSlot: opt.value === 'any' ? null : opt.value,
                  })
                }
                className={`min-h-11 rounded-[14px] border px-3 py-2 text-left text-xs transition-colors ${
                  timeSlot === opt.value
                    ? 'border-brand bg-brand-periwinkle font-semibold text-brand-dark'
                    : 'border-brand-line text-brand-text hover:border-brand/40'
                }`}
              >
                <div className="font-medium">{opt.label}</div>
                {opt.hint ? (
                  <div className="text-brand-muted">{opt.hint}</div>
                ) : null}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label
            htmlFor="maxPrice"
            className="text-sm font-bold text-brand-ink"
          >
            Max price per passenger (IDR)
          </Label>
          <div className="flex gap-2">
            <Input
              id="maxPrice"
              type="number"
              min={0}
              step={50000}
              placeholder="e.g. 300000"
              value={priceInput}
              onChange={(e) => setPriceInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  applyPriceFilter();
                }
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={applyPriceFilter}
            >
              Apply
            </Button>
          </div>
        </div>
      </div>

      {isPending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm">
          <div className="rounded-lg bg-white px-6 py-4 shadow-lg">
            <div className="flex items-center gap-3">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-line border-t-brand" />
              <span className="text-sm font-medium text-brand-text">Loading results...</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
