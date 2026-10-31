'use client';

import * as React from 'react';
import { Star } from 'lucide-react';

/**
 * 5-star rating input. Sets a hidden input value (1-5). Hover and active
 * states track which stars highlight.
 */
export function StarRating({
  name = 'rating',
  defaultValue = 0,
}: {
  name?: string;
  defaultValue?: number;
}) {
  const [value, setValue] = React.useState(defaultValue);
  const [hover, setHover] = React.useState(0);
  const display = hover || value;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <input type="hidden" name={name} value={value} />
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          aria-label={`Rate ${n} star${n === 1 ? '' : 's'}`}
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(0)}
          onClick={() => setValue(n)}
          className="flex h-12 w-12 items-center justify-center rounded-2xl transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <Star
            className={
              display >= n
                ? 'h-9 w-9 fill-amber-400 stroke-amber-500'
                : 'h-9 w-9 fill-transparent stroke-slate-300'
            }
          />
        </button>
      ))}
      {value > 0 ? (
        <span className="ml-2 text-sm font-semibold text-brand-text">
          {value}/5
        </span>
      ) : null}
    </div>
  );
}
