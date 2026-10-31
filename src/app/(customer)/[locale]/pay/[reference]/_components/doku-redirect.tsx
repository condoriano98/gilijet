'use client';

import { useState } from 'react';
import { Button } from '@/shared/ui/button';
import { DokuMethodMarks } from '@/features/payments/components/payment-marks';

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
    <form action={startAction} onSubmit={() => setLoading(true)} className="space-y-3 rounded-[20px] border-[1.5px] border-brand bg-brand-surface p-4 sm:p-5">
      <input type="hidden" name="reference" value={bookingReference} />
      <DokuMethodMarks />
      <Button type="submit" disabled={loading} className="min-h-14 w-full rounded-2xl bg-brand text-base font-bold text-white hover:bg-brand-dark" size="lg">
        {loading ? 'Opening payment…' : `Pay ${amountLabel}`}
      </Button>
      <p className="text-center text-[13px] text-brand-muted">
        Choose your method on the secure DOKU payment page.
      </p>
    </form>
  );
}
