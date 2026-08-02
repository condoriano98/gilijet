"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * PayPal Standard Checkout entry point.
 *
 * Deliberately a plain redirect to PayPal's approve URL rather than the inline
 * JS SDK: the SDK's client-side `onApprove` is not a trustworthy signal that
 * money moved, and the redirect brings the customer back to /pay/{ref}, where
 * the server captures the order and issues tickets in one pass. One code path,
 * server-verified.
 */

type Props = {
  bookingReference: string;
  /** e.g. "$42.50 USD" — what the customer will actually be charged. */
  presentmentLabel: string;
  /** The IDR total this converts from, so the conversion is never a surprise. */
  idrLabel: string;
  startAction: (formData: FormData) => Promise<void>;
};

export function PaypalButton({
  bookingReference,
  presentmentLabel,
  idrLabel,
  startAction,
}: Props) {
  const [loading, setLoading] = useState(false);

  return (
    <form action={startAction} onSubmit={() => setLoading(true)} className="space-y-2">
      <input type="hidden" name="reference" value={bookingReference} />
      <Button
        type="submit"
        disabled={loading}
        variant="outline"
        className="w-full"
        size="lg"
      >
        {loading
          ? "Opening PayPal…"
          : `Pay ${presentmentLabel} by card or PayPal`}
      </Button>
      <p className="text-center text-xs text-slate-500">
        Credit and debit cards are handled here — no PayPal account needed.
        Charged in {presentmentLabel}, converted from {idrLabel} at today&apos;s
        rate; your bank may add its own conversion fee.
      </p>
    </form>
  );
}
