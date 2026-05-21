"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { formatIDR } from "@/lib/utils";

type MethodGroup = {
  id: string;
  label: string;
  caption: string;
  options: { id: string; name: string; logo: string }[];
};

const GROUPS: MethodGroup[] = [
  {
    id: "va",
    label: "Virtual Account",
    caption: "Transfer from any bank in Indonesia",
    options: [
      { id: "bca", name: "BCA", logo: "BCA" },
      { id: "bni", name: "BNI", logo: "BNI" },
      { id: "bri", name: "BRI", logo: "BRI" },
      { id: "mandiri", name: "Mandiri", logo: "MDR" },
      { id: "permata", name: "Permata", logo: "PMT" },
    ],
  },
  {
    id: "ewallet",
    label: "E-Wallet",
    caption: "Tap & pay with your wallet app",
    options: [
      { id: "gopay", name: "GoPay", logo: "GP" },
      { id: "ovo", name: "OVO", logo: "OVO" },
      { id: "dana", name: "DANA", logo: "DN" },
      { id: "shopeepay", name: "ShopeePay", logo: "SP" },
    ],
  },
  {
    id: "qris",
    label: "QRIS",
    caption: "Scan with any Indonesian bank or e-wallet app",
    options: [{ id: "qris", name: "QRIS", logo: "QR" }],
  },
  {
    id: "card",
    label: "Credit / Debit Card",
    caption: "Visa, Mastercard, JCB",
    options: [
      { id: "visa", name: "Visa", logo: "VS" },
      { id: "mastercard", name: "Mastercard", logo: "MC" },
      { id: "jcb", name: "JCB", logo: "JCB" },
    ],
  },
  {
    id: "retail",
    label: "Retail Outlet",
    caption: "Pay at any Alfamart or Indomaret",
    options: [
      { id: "alfamart", name: "Alfamart", logo: "AM" },
      { id: "indomaret", name: "Indomaret", logo: "IM" },
    ],
  },
];

function vaNumber(amount: number) {
  // Deterministic-looking 16-digit "VA number" derived from the amount —
  // purely cosmetic, this is a dummy checkout.
  const base = 8808_1000_0000_0000n + BigInt(amount % 9_999_999);
  return base
    .toString()
    .replace(/(\d{4})(\d{4})(\d{4})(\d{4}).*/, "$1 $2 $3 $4");
}

export function CheckoutMethods({
  reference,
  amount,
  simulateAction,
}: {
  reference: string;
  amount: number;
  simulateAction: (fd: FormData) => Promise<void>;
}) {
  const [openGroup, setOpenGroup] = useState<string>("va");
  const [selected, setSelected] = useState<{ group: string; option: string }>({
    group: "va",
    option: "bca",
  });

  return (
    <div className="mt-5 space-y-3">
      {GROUPS.map((g) => {
        const isOpen = openGroup === g.id;
        return (
          <div
            key={g.id}
            className="overflow-hidden rounded-lg border bg-white"
          >
            <button
              type="button"
              onClick={() => setOpenGroup(isOpen ? "" : g.id)}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50"
            >
              <div>
                <div className="text-sm font-semibold text-slate-900">
                  {g.label}
                </div>
                <div className="text-xs text-slate-500">{g.caption}</div>
              </div>
              <div className="text-slate-400">{isOpen ? "−" : "+"}</div>
            </button>
            {isOpen && (
              <div className="border-t bg-slate-50 px-4 py-3">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {g.options.map((o) => {
                    const isSel =
                      selected.group === g.id && selected.option === o.id;
                    return (
                      <button
                        key={o.id}
                        type="button"
                        onClick={() =>
                          setSelected({ group: g.id, option: o.id })
                        }
                        className={[
                          "flex items-center gap-2 rounded-md border bg-white px-3 py-2 text-left text-sm transition-colors",
                          isSel
                            ? "border-sky-500 ring-2 ring-sky-200"
                            : "border-slate-200 hover:border-slate-300",
                        ].join(" ")}
                      >
                        <span className="flex h-7 w-10 items-center justify-center rounded bg-slate-900 text-[10px] font-bold text-white">
                          {o.logo}
                        </span>
                        <span className="text-slate-700">{o.name}</span>
                      </button>
                    );
                  })}
                </div>

                {selected.group === g.id && (
                  <Instructions
                    group={g.id}
                    option={selected.option}
                    amount={amount}
                  />
                )}
              </div>
            )}
          </div>
        );
      })}

      <form
        action={simulateAction}
        className="mt-6 flex flex-col gap-3 border-t pt-5 sm:flex-row sm:items-center sm:justify-between"
      >
        <input type="hidden" name="reference" value={reference} />
        <input
          type="hidden"
          name="method"
          value={`${selected.group}:${selected.option}`}
        />
        <div className="text-xs text-slate-500">
          Selected:{" "}
          <span className="font-semibold uppercase">
            {selected.group} · {selected.option}
          </span>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            type="submit"
            name="outcome"
            value="fail"
            variant="outline"
            className="text-red-700"
          >
            Simulate failure
          </Button>
          <Button type="submit" name="outcome" value="success" size="lg">
            I have paid {formatIDR(amount)}
          </Button>
        </div>
      </form>
    </div>
  );
}

function Instructions({
  group,
  option,
  amount,
}: {
  group: string;
  option: string;
  amount: number;
}) {
  if (group === "va") {
    return (
      <div className="mt-3 rounded-md bg-white p-4 text-sm">
        <div className="font-semibold text-slate-900">
          {option.toUpperCase()} Virtual Account
        </div>
        <div className="mt-2 flex items-center justify-between rounded-md bg-slate-100 px-3 py-2 font-mono text-base text-slate-900">
          <span>{vaNumber(amount)}</span>
          <button
            type="button"
            onClick={() => navigator.clipboard?.writeText(vaNumber(amount))}
            className="text-xs font-medium text-sky-700 hover:underline"
          >
            Copy
          </button>
        </div>
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-xs text-slate-600">
          <li>Open your {option.toUpperCase()} mobile banking or ATM</li>
          <li>Choose &quot;Transfer&quot; → &quot;Virtual Account&quot;</li>
          <li>Enter the VA number above</li>
          <li>Confirm amount {formatIDR(amount)} and complete</li>
        </ol>
      </div>
    );
  }

  if (group === "qris") {
    return (
      <div className="mt-3 flex flex-col items-center gap-3 rounded-md bg-white p-4">
        <div className="grid h-44 w-44 grid-cols-12 grid-rows-12 gap-0.5 rounded border bg-white p-1.5">
          {Array.from({ length: 144 }).map((_, i) => {
            const seed = (i * 9301 + amount * 49297) % 233280;
            const on = seed % 100 < 48;
            const corner =
              (i < 36 && (i % 12 < 3 || i % 12 > 8)) ||
              (i % 12 < 3 && i > 107);
            return (
              <div
                key={i}
                className={
                  on || corner ? "bg-slate-900" : "bg-transparent"
                }
              />
            );
          })}
        </div>
        <div className="text-xs text-slate-600">
          Scan with any Indonesian bank or e-wallet app supporting QRIS
        </div>
      </div>
    );
  }

  if (group === "ewallet") {
    return (
      <div className="mt-3 rounded-md bg-white p-4 text-sm">
        <div className="font-semibold text-slate-900">
          {option.toUpperCase()}
        </div>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs text-slate-600">
          <li>Open the {option.toUpperCase()} app</li>
          <li>Tap &quot;Scan&quot; / &quot;Pay&quot;</li>
          <li>Approve the {formatIDR(amount)} charge</li>
        </ol>
      </div>
    );
  }

  if (group === "card") {
    return (
      <div className="mt-3 rounded-md bg-white p-4 text-sm">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <div className="mb-1 text-xs text-slate-500">Card number</div>
            <input
              disabled
              defaultValue="4000 0000 0000 0002"
              className="w-full rounded-md border bg-slate-50 px-3 py-2 font-mono text-sm text-slate-500"
            />
          </div>
          <div>
            <div className="mb-1 text-xs text-slate-500">Expiry</div>
            <input
              disabled
              defaultValue="12 / 28"
              className="w-full rounded-md border bg-slate-50 px-3 py-2 font-mono text-sm text-slate-500"
            />
          </div>
          <div>
            <div className="mb-1 text-xs text-slate-500">CVV</div>
            <input
              disabled
              defaultValue="123"
              className="w-full rounded-md border bg-slate-50 px-3 py-2 font-mono text-sm text-slate-500"
            />
          </div>
        </div>
        <div className="mt-2 text-xs text-slate-500">
          Demo card prefilled — clicking &quot;I have paid&quot; simulates a
          successful charge.
        </div>
      </div>
    );
  }

  if (group === "retail") {
    return (
      <div className="mt-3 rounded-md bg-white p-4 text-sm">
        <div className="font-semibold text-slate-900">
          {option.toUpperCase()} Payment Code
        </div>
        <div className="mt-2 rounded-md bg-slate-100 px-3 py-2 font-mono text-base text-slate-900">
          {(8800_000_000 + (amount % 999_999)).toString()}
        </div>
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-xs text-slate-600">
          <li>Show this code at any {option.toUpperCase()} cashier</li>
          <li>Pay {formatIDR(amount)} in cash</li>
          <li>Keep the receipt</li>
        </ol>
      </div>
    );
  }

  return null;
}
