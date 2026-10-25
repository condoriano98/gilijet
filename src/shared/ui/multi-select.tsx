'use client';

import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { Checkbox } from '@/shared/ui/checkbox';

export type MultiSelectOption = { value: string; label: string };

/**
 * Dropdown of checkboxes for a plain `<form>`. It always has an explicit "All"
 * choice, so "no restriction" is a visible answer rather than an empty field.
 *
 * Posts `name` once per picked option, or `${name}All=on` when All is ticked.
 * The inputs are rendered here, outside the popover, because the popover is
 * portaled and its checkboxes would not be part of the form.
 */
export function MultiSelect({
  id,
  name,
  options,
  defaultValues,
  allLabel,
  noun,
}: {
  id?: string;
  name: string;
  options: MultiSelectOption[];
  /** Pre-picked values; none means All. */
  defaultValues: string[];
  allLabel: string;
  /** Plural noun for the summary, e.g. "routes". */
  noun: string;
}) {
  const [all, setAll] = React.useState(defaultValues.length === 0);
  const [picked, setPicked] = React.useState<Set<string>>(new Set(defaultValues));

  function toggle(value: string, on: boolean) {
    const next = new Set(picked);
    if (on) next.add(value);
    else next.delete(value);
    setPicked(next);
    // Clearing the last pick falls back to All instead of an invalid empty set.
    setAll(next.size === 0);
  }

  function toggleAll(on: boolean) {
    // With nothing else picked, All is the only valid answer.
    if (!on && picked.size === 0) return;
    setAll(on);
    if (on) setPicked(new Set());
  }

  const summary = all
    ? allLabel
    : picked.size === 1
      ? (options.find((o) => picked.has(o.value))?.label ?? `1 ${noun.replace(/s$/, '')}`)
      : `${picked.size} ${noun} selected`;

  return (
    <>
      {all ? (
        <input type="hidden" name={`${name}All`} value="on" />
      ) : (
        Array.from(picked).map((v) => (
          <input key={v} type="hidden" name={name} value={v} />
        ))
      )}
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            id={id}
            className="flex h-10 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-left text-sm"
          >
            <span className="truncate">{summary}</span>
            <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start">
          <div className="max-h-72 w-72 overflow-y-auto p-2">
            <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm font-medium hover:bg-slate-50">
              <Checkbox checked={all} onCheckedChange={(c) => toggleAll(c === true)} />
              {allLabel}
            </label>
            <div className="my-1 border-t" />
            {options.length === 0 ? (
              <p className="px-2 py-1.5 text-xs text-muted-foreground">
                Nothing active to pick yet.
              </p>
            ) : (
              options.map((o) => (
                <label
                  key={o.value}
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-slate-50"
                >
                  <Checkbox
                    checked={picked.has(o.value)}
                    onCheckedChange={(c) => toggle(o.value, c === true)}
                  />
                  <span className="min-w-0 break-words">{o.label}</span>
                </label>
              ))
            )}
          </div>
        </PopoverContent>
      </Popover>
    </>
  );
}
