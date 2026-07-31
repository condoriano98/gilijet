"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import Script from "next/script";
import { Button } from "@/components/ui/button";

/**
 * Client component that loads Midtrans Snap JS and opens the payment
 * popup when the user clicks "Pay now".  After payment succeeds (or
 * is pending) we redirect to the booking confirmation page.
 */

const SNAP_SCRIPT_SRC = "https://app.sandbox.midtrans.com/snap/snap.js";

declare global {
  interface Window {
    snap?: {
      pay: (
        token: string,
        options: {
          onSuccess?: (result: unknown) => void;
          onPending?: (result: unknown) => void;
          onError?: (result: unknown) => void;
          onClose?: () => void;
        },
      ) => void;
    };
  }
}

type Props = {
  snapToken: string;
  bookingReference: string;
  amountLabel: string;
  /** Midtrans Client Key. Snap.js will not initialise without it. */
  clientKey: string;
  isProduction?: boolean;
};

export function MidtransSnap({
  snapToken,
  bookingReference,
  amountLabel,
  clientKey,
  isProduction,
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const snapSrc = isProduction
    ? "https://app.midtrans.com/snap/snap.js"
    : SNAP_SCRIPT_SRC;

  const openSnap = useCallback(() => {
    if (!snapToken) {
      setError("Payment token not available");
      return;
    }
    if (!window.snap) {
      setError("Payment gateway not loaded — please refresh the page");
      return;
    }
    setLoading(true);
    setError(null);

    window.snap.pay(snapToken, {
      onSuccess() {
        setLoading(false);
        router.push(`/b/${bookingReference}`);
      },
      onPending() {
        setLoading(false);
        router.push(`/b/${bookingReference}`);
      },
      onError() {
        setLoading(false);
        setError("Payment was not completed. You can try again.");
      },
      onClose() {
        setLoading(false);
      },
    });
  }, [snapToken, bookingReference, router]);

  return (
    <div className="space-y-3">
      <Script
        src={snapSrc}
        // Snap.js authenticates the browser with the Client Key; without it the
        // library loads but the payment modal never initialises.
        data-client-key={clientKey}
        strategy="afterInteractive"
        onError={() => setError("Failed to load payment gateway")}
      />
      <Button
        onClick={openSnap}
        disabled={loading}
        className="w-full"
        size="lg"
      >
        {loading ? "Opening payment..." : `Pay ${amountLabel}`}
      </Button>
      {error ? (
        <p className="text-center text-xs text-rose-600">{error}</p>
      ) : null}
      <p className="text-center text-xs text-slate-500">
        You will be redirected to the secure Midtrans payment page
      </p>
    </div>
  );
}
