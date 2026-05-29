"use client";

import { useState, useEffect, useTransition } from "react";
import { formatIDR } from "@/lib/utils";

type Tab = "card" | "qris" | "bank";

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
  const [tab, setTab] = useState<Tab>("card");
  const [isPending, startTransition] = useTransition();
  const [timeLeft, setTimeLeft] = useState("");
  const [agreed, setAgreed] = useState(false);

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
    fd.set("method", tab);
    startTransition(() => simulateAction(fd));
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "card", label: "Card" },
    { id: "qris", label: "QRIS" },
    { id: "bank", label: "Bank Transfer" },
  ];

  return (
    <div className="space-y-5">
      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={[
              "flex-1 rounded-md px-3 py-2 text-sm font-medium transition-all",
              tab === t.id
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-700",
            ].join(" ")}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Card tab */}
      {tab === "card" && (
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">
              Email
            </label>
            <input
              readOnly
              value={customerEmail}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">
              Card number
            </label>
            <input
              readOnly
              value="4242 4242 4242 4242"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 font-mono text-sm text-slate-700"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Expiry
              </label>
              <input
                readOnly
                value="12 / 28"
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 font-mono text-sm text-slate-700"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                CVC
              </label>
              <input
                readOnly
                value="123"
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 font-mono text-sm text-slate-700"
              />
            </div>
          </div>
          <p className="text-xs text-slate-400">
            Test card pre-filled — no real charge.
          </p>
        </div>
      )}

      {/* QRIS tab */}
      {tab === "qris" && (
        <div className="flex flex-col items-center gap-3 py-2">
          <QrisDummy amount={amount} />
          <p className="text-xs text-slate-500">
            Scan with any e-wallet or banking app (demo)
          </p>
        </div>
      )}

      {/* Bank transfer tab */}
      {tab === "bank" && (
        <div className="space-y-3">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs font-medium text-slate-500">
              Bank BCA · Virtual Account
            </div>
            <div className="mt-1 font-mono text-lg font-semibold text-slate-800 tracking-wider">
              8808 1234 5678 9012
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs font-medium text-slate-500">
              Amount to transfer
            </div>
            <div className="mt-1 font-mono text-lg font-semibold text-slate-800">
              {formatIDR(amount)}
            </div>
          </div>
          <p className="text-xs text-slate-400">
            Demo virtual account — click Pay to simulate transfer.
          </p>
        </div>
      )}

      {/* Timer */}
      <div className="text-center text-xs text-slate-400">
        Expires in{" "}
        <span className="font-mono font-medium text-slate-600">
          {timeLeft}
        </span>
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

function QrisDummy({ amount }: { amount: number }) {
  const cells = Array.from({ length: 225 }, (_, i) => {
    const seed = (i * 9301 + amount * 49297) % 233280;
    const on = seed % 100 < 45;
    const row = Math.floor(i / 15);
    const col = i % 15;
    const corner =
      (row < 3 && col < 3) ||
      (row < 3 && col > 11) ||
      (row > 11 && col < 3);
    return on || corner;
  });

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mx-auto grid h-40 w-40 grid-cols-[repeat(15,1fr)] gap-px">
        {cells.map((on, i) => (
          <div
            key={i}
            className={on ? "bg-slate-900 rounded-[1px]" : "bg-transparent"}
          />
        ))}
      </div>
    </div>
  );
}
