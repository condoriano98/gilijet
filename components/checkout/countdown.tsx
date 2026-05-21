"use client";

import { useEffect, useState } from "react";

export function CheckoutCountdown({ expiresAtIso }: { expiresAtIso: string }) {
  const expires = new Date(expiresAtIso).getTime();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const msLeft = Math.max(0, expires - now);
  const minutes = Math.floor(msLeft / 60_000);
  const seconds = Math.floor((msLeft % 60_000) / 1000);
  const pad = (n: number) => n.toString().padStart(2, "0");

  if (msLeft <= 0) {
    return <span>This invoice has expired. Return to your booking to retry.</span>;
  }

  return (
    <span>
      Complete payment within{" "}
      <span className="font-mono font-semibold">
        {pad(minutes)}:{pad(seconds)}
      </span>
    </span>
  );
}
