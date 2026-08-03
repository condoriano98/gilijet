"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * Sends the customer to DOKU's hosted checkout page.
 *
 * A plain server-action redirect rather than an embedded widget: the channel
 * picker, the VA numbers and the card form all live on DOKU's page, and payment
 * is confirmed by their signed notification, not by anything the browser tells
 * us. One code path, server-verified.
 */

type Props = {
  bookingReference: string;
  amountLabel: string;
  startAction: (formData: FormData) => Promise<void>;
};

export function DokuRedirect({
  bookingReference,
  amountLabel,
  startAction,
}: Props) {
  const [loading, setLoading] = useState(false);

  return (
    <form action={startAction} onSubmit={() => setLoading(true)} className="space-y-3">
      <input type="hidden" name="reference" value={bookingReference} />
      <Button type="submit" disabled={loading} className="w-full" size="lg">
        {loading ? "Opening payment…" : `Pay ${amountLabel}`}
      </Button>
      <p className="text-center text-xs text-slate-500">
        Bank transfer, QRIS, e-wallet, card or convenience store — choose on the
        secure DOKU payment page.
      </p>
    </form>
  );
}
