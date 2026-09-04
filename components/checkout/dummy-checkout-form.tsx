"use client";

import { useEffect, useState, useTransition } from "react";
import { formatIDR } from "@/lib/utils";

export function DummyCheckoutForm({
  reference,
  amount,
  customerEmail,
  expiresAtIso,
  simulateAction,
}: {
  reference: string;
  amount: number;
  customerEmail: string;
  expiresAtIso: string;
  simulateAction: (fd: FormData) => Promise<void>;
}) {
  const [isPending, startTransition] = useTransition();
  const [agreed, setAgreed] = useState(false);
  const [timeLeft, setTimeLeft] = useState("");

  useEffect(() => {
    const expires = new Date(expiresAtIso).getTime();
    const tick = () => {
      const ms = Math.max(0, expires - Date.now());
      const m = Math.floor(ms / 60_000);
      const s = Math.floor((ms % 60_000) / 1000);
      setTimeLeft(`${m}:${s.toString().padStart(2, "0")}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAtIso]);

  function handleSubmit(outcome: "success" | "fail") {
    if (outcome === "success" && !agreed) return;
    const fd = new FormData();
    fd.set("reference", reference);
    fd.set("outcome", outcome);
    fd.set("method", "card");
    startTransition(() => simulateAction(fd));
  }

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
        Test mode — dummy gateway. Clicking Pay completes the payment
        instantly. No real charge and no banking app required.
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-slate-500">Amount</span>
          <span className="font-mono font-semibold text-slate-800">
            {formatIDR(amount)}
          </span>
        </div>
        <div className="mt-1 text-xs text-slate-400">
          Demo card 4242 4242 4242 4242 · {customerEmail} · no real charge
        </div>
      </div>

      <div className="text-center text-xs text-slate-400">
        Expires in{" "}
        <span className="font-mono font-medium text-slate-600">{timeLeft}</span>
      </div>

      {/* Terms agreement gate */}
      <label className="flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-0.5 h-4 w-4 flex-shrink-0"
        />
        <span>
          I have read and agree to the{" "}
          <a
            href="/terms"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-sky-700 underline"
          >
            Terms &amp; Conditions and Refund Policy
          </a>
          . By paying I accept the cancellation schedule and confirm my booking
          details are correct.
        </span>
      </label>

      {/* Buttons */}
      <button
        type="button"
        disabled={isPending || !agreed}
        onClick={() => handleSubmit("success")}
        className="w-full rounded-lg bg-sky-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isPending
          ? "Processing..."
          : agreed
            ? `Pay ${formatIDR(amount)}`
            : "Accept the terms to pay"}
      </button>
      <button
        type="button"
        disabled={isPending}
        onClick={() => handleSubmit("fail")}
        className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-500 transition-colors hover:bg-slate-50 disabled:opacity-50"
      >
        Cancel payment
      </button>
    </div>
  );
}