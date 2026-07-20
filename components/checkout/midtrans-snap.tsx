"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  isProduction?: boolean;
};

export function MidtransSnap({
  snapToken,
  bookingReference,
  amountLabel,
  isProduction,
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <div className="space-y-3">
      <Script
        src={snapSrc}
        data-client-key="" // Midtrans Snap only needs the token, not the client key
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
