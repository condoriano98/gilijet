"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { MidtransMethodMarks } from "@/components/checkout/payment-marks";

/**
 * Sends the customer to Midtrans' hosted Snap checkout page.
 *
 * A plain server-action redirect rather than an embedded widget: the channel
 * picker, the VA numbers and the card form all live on Midtrans' page, and
 * payment is confirmed by their signed notification, not by anything the
 * browser tells us. One code path, server-verified.
 */

type Props = {
  bookingReference: string;
  amountLabel: string;
  startAction: (formData: FormData) => Promise<void>;
};

export function MidtransRedirect({
  bookingReference,
  amountLabel,
  startAction,
}: Props) {
  const [loading, setLoading] = useState(false);

  return (
    <form action={startAction} onSubmit={() => setLoading(true)} className="space-y-3">
      <input type="hidden" name="reference" value={bookingReference} />
      <MidtransMethodMarks />
      <Button type="submit" disabled={loading} className="w-full" size="lg">
        {loading ? "Opening payment…" : `Pay ${amountLabel}`}
      </Button>
      <p className="text-center text-xs text-slate-500">
        Choose your method on the secure Midtrans payment page.
      </p>
    </form>
  );
}