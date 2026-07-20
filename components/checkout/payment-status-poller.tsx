"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Polls the booking's payment status while the customer completes a
 * payment out-of-band. Advances to the booking page once the Midtrans
 * notification has confirmed it.
 */
export function PaymentStatusPoller({ reference }: { reference: string }) {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let active = true;
    const id = setInterval(async () => {
      try {
        const r = await fetch(`/api/bookings/${reference}/payment-status`, {
          cache: "no-store",
        });
        if (!r.ok) return;
        const d = await r.json();
        if (!active) return;
        if (d.bookingStatus === "CONFIRMED") {
          clearInterval(id);
          router.push(`/b/${reference}`);
        } else if (
          d.bookingStatus === "EXPIRED" ||
          d.bookingStatus?.startsWith("CANCELLED")
        ) {
          clearInterval(id);
          setChecking(false);
          router.refresh();
        }
      } catch {
        /* transient; keep polling */
      }
    }, 4000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [reference, router]);

  return (
    <div className="flex items-center justify-center gap-2 text-xs text-slate-500">
      <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-brand" />
      {checking ? "Waiting for your payment…" : "Checking…"}
    </div>
  );
}
