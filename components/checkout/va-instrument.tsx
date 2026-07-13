"use client";

import { useState } from "react";

export function VaInstrument({
  bank,
  vaNumber,
  amountLabel,
}: {
  bank: string;
  vaNumber: string;
  amountLabel: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-[10px] border border-slate-200 bg-white p-4 text-sm">
      <div className="font-semibold text-slate-900">{bank} Virtual Account</div>
      <div className="mt-2 flex items-center justify-between rounded-md bg-slate-100 px-3 py-2 font-mono text-base text-slate-900">
        <span>{vaNumber}</span>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard?.writeText(vaNumber);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="text-xs font-medium text-brand hover:underline"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <ol className="mt-3 list-decimal space-y-1 pl-5 text-xs text-slate-600">
        <li>Open your {bank} mobile banking or ATM</li>
        <li>Choose &quot;Transfer&quot; → &quot;Virtual Account&quot;</li>
        <li>Enter the VA number above</li>
        <li>Confirm the amount {amountLabel} and complete the transfer</li>
      </ol>
    </div>
  );
}
