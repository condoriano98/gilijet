"use client";

import { CopyButton } from "./payment-countdown";

/**
 * Share/copy actions for a confirmed booking. WhatsApp deep link works on
 * mobile + desktop (wa.me); copy puts the lookup URL on the clipboard so
 * the customer can paste it anywhere.
 */
export function ShareButtons({
  bookingReference,
  origin,
  destination,
  date,
  lookupUrl,
}: {
  bookingReference: string;
  origin: string;
  destination: string;
  date: string;
  lookupUrl: string;
}) {
  const waText = `My Gilifast booking ${bookingReference} — ${origin} → ${destination} on ${date}. View: ${lookupUrl}`;
  const waUrl = `https://wa.me/?text=${encodeURIComponent(waText)}`;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <a
        href={waUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100"
      >
        Share on WhatsApp
      </a>
      <CopyButton value={lookupUrl} label="Copy link" />
    </div>
  );
}
