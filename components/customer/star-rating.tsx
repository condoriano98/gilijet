"use client";

import * as React from "react";
import { Star } from "lucide-react";

/**
 * 5-star rating input. Sets a hidden input value (1-5). Hover and active
 * states track which stars highlight.
 */
export function StarRating({
  name = "rating",
  defaultValue = 0,
}: {
  name?: string;
  defaultValue?: number;
}) {
  const [value, setValue] = React.useState(defaultValue);
  const [hover, setHover] = React.useState(0);
  const display = hover || value;

  return (
    <div className="flex items-center gap-1">
      <input type="hidden" name={name} value={value} />
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          aria-label={`Rate ${n} star${n === 1 ? "" : "s"}`}
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(0)}
          onClick={() => setValue(n)}
          className="rounded p-0.5 transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-amber-400"
        >
          <Star
            className={
              display >= n
                ? "h-8 w-8 fill-amber-400 stroke-amber-500"
                : "h-8 w-8 fill-transparent stroke-slate-300"
            }
          />
        </button>
      ))}
      {value > 0 ? (
        <span className="ml-2 text-sm font-medium text-slate-700">
          {value}/5
        </span>
      ) : null}
    </div>
  );
}
