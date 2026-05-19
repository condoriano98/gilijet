"use client";

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";

export function PaymentCountdown({ createdAtIso, holdMinutes }: { createdAtIso: string; holdMinutes: number }) {
  const expiresAt = new Date(createdAtIso).getTime() + holdMinutes * 60 * 1000;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const remainingMs = Math.max(0, expiresAt - now);
  const mins = Math.floor(remainingMs / 60000);
  const secs = Math.floor((remainingMs % 60000) / 1000);

  const expired = remainingMs <= 0;
  const warning = remainingMs < 5 * 60 * 1000 && !expired;

  return (
    <div
      className={[
        "flex items-center gap-2 rounded-md p-3 text-sm",
        expired
          ? "bg-red-50 text-red-700"
          : warning
            ? "bg-amber-50 text-amber-900"
            : "bg-sky-50 text-sky-900",
      ].join(" ")}
    >
      <Clock className="h-4 w-4" />
      {expired ? (
        <span className="font-medium">Payment window expired — please start a new booking.</span>
      ) : (
        <>
          <span className="font-medium">
            {String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}
          </span>
          <span>remaining to complete payment</span>
        </>
      )}
    </div>
  );
}

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable; ignore.
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="ml-2 inline-flex items-center rounded border border-slate-300 px-2 py-0.5 text-xs hover:bg-slate-50"
    >
      {copied ? "Copied!" : label}
    </button>
  );
}
